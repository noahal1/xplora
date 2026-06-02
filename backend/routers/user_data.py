"""User data export and import endpoints."""

import json
from datetime import datetime, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, UploadFile, File
from fastapi.responses import StreamingResponse

from auth import get_current_user
from models import MovieRating, WishlistItem
from scraper import background_enrich_movies

router = APIRouter(prefix="/api/user", tags=["user-data"])


@router.get("/export")
async def export_my_data(
    current_user: dict = Depends(get_current_user),
):
    """Export current user's data as JSON (movies + wishlist + sessions)."""
    from database import get_session
    from models import MovieRecord, SessionRecord, RecommendationRecord

    db = get_session()
    try:
        user_id = current_user["id"]
        movies = db.query(MovieRecord).filter(MovieRecord.user_id == user_id).all()
        sessions = db.query(SessionRecord).filter(SessionRecord.user_id == user_id).all()

        sessions_data = []
        for s in sessions:
            recs = db.query(RecommendationRecord).filter(RecommendationRecord.session_id == s.id).all()
            sessions_data.append({
                "id": s.id,
                "model": s.model,
                "source_count": s.source_count,
                "created_at": s.created_at.isoformat(),
                "recommendations": [
                    {"title": r.title, "year": r.year, "genre": r.genre, "reason": r.reason, "confidence": r.confidence}
                    for r in recs
                ],
            })

        export = {
            "export_time": datetime.now(timezone.utc).isoformat(),
            "version": "2.0.0",
            "username": current_user["username"],
            "movies": [
                {
                    "id": m.id,
                    "title": m.title,
                    "rating": m.rating,
                    "year": m.year,
                    "genre": m.genre,
                    "status": m.status,
                    "created_at": m.created_at.isoformat(),
                }
                for m in movies
            ],
            "sessions": sessions_data,
        }

        return StreamingResponse(
            iter([json.dumps(export, ensure_ascii=False, indent=2)]),
            media_type="application/json",
            headers={
                "Content-Disposition": f'attachment; filename="xplore-{current_user["username"]}-{datetime.now(timezone.utc).strftime("%Y%m%d")}.json"',
            },
        )
    finally:
        db.close()


@router.post("/import")
async def import_my_data(
    file: UploadFile = File(...),
    background_tasks: BackgroundTasks = BackgroundTasks(),
    current_user: dict = Depends(get_current_user),
):
    """Import movies from a previously exported JSON file.

    Metadata enrichment (poster, overview, etc.) runs asynchronously
    in the background after the response is sent.
    """
    if not file.filename or not file.filename.endswith(".json"):
        raise HTTPException(status_code=400, detail="请上传 .json 文件")

    try:
        content = await file.read()
        data = json.loads(content)
    except Exception:
        raise HTTPException(status_code=400, detail="无法解析 JSON 文件")

    movies = data.get("movies", [])
    if not isinstance(movies, list) or len(movies) == 0:
        raise HTTPException(status_code=400, detail="未找到有效的电影数据")

    from crud import save_movies, save_wishlist_items

    # Parse and group by status in a single pass (avoids index mismatch
    # when empty-title items are skipped)
    watched_items: list[dict] = []
    wish_items: list[dict] = []
    for m in movies:
        title = m.get("title", "").strip() if isinstance(m, dict) else ""
        if not title:
            continue
        try:
            rating = float(m.get("rating", 5.0))
        except (ValueError, TypeError):
            rating = 5.0
        item = {
            "title": title,
            "rating": max(0.0, min(10.0, rating)),
            "year": m.get("year"),
            "genre": m.get("genre"),
        }
        s = m.get("status", "watched") if isinstance(m, dict) else "watched"
        if s not in ("watched", "wish"):
            s = "watched"
        if s == "wish":
            wish_items.append(item)
        else:
            watched_items.append(item)

    if not watched_items and not wish_items:
        raise HTTPException(status_code=400, detail="未找到有效的电影数据")

    total_records = []
    if watched_items:
        rating_items = [MovieRating(title=m["title"], rating=m["rating"], year=m["year"], genre=m.get("genre")) for m in watched_items]
        total_records.extend(save_movies(rating_items, current_user["id"], status="watched"))
    if wish_items:
        wish_list = [WishlistItem(title=m["title"], year=m["year"], genre=m.get("genre")) for m in wish_items]
        total_records.extend(save_wishlist_items(wish_list, current_user["id"]))

    # Launch background metadata scraping for all imported records
    movie_ids = [r.id for r in total_records]
    if movie_ids:
        background_tasks.add_task(background_enrich_movies, current_user["id"], movie_ids)

    # Determine primary status type for response
    status_type = "watched" if len(watched_items) >= len(wish_items) else "wish"
    return {"status": "imported", "count": len(total_records), "status_type": status_type}
