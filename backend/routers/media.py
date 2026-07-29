"""Media item, wishlist, and external search endpoints."""

from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from sqlmodel import Session

from auth import get_current_user
from deps import get_user_db
from helpers import parse_movie_data, NORMALIZE_GENRE, NORMALIZE_COUNTRY
from models import (
    MediaData,
    MediaRating,
    WishlistData,
    WishlistItem,
    MarkAsWatchedRequest,
)
from crud import (
    save_media,
    save_wishlist_items,
    get_media as db_get_media,
    get_media_titles as db_get_media_titles,
    get_media_by_title,
    get_media_for_user,
    get_enrich_progress as db_get_enrich_progress,
    get_unenriched_media_ids as db_get_unenriched_media_ids,
    get_external_poster_media_ids as db_get_external_poster_media_ids,
    mark_media_as_watched,
    update_media as db_update_media,
    delete_media as db_delete_media,
    batch_delete_media as db_batch_delete_media,
    delete_all_media_for_user,
    db_delete_media_by_status,
    enrich_media_metadata as db_enrich_media_metadata,
    clear_scrape_error as db_clear_scrape_error,
    set_scrape_error as db_set_scrape_error,
    get_media_stats,
    get_top_rated,
    reorder_top_rated,
    add_to_top_rated,
    remove_from_top_rated,
    log_operation,
)
from movie_search import search_movies as search_external_movies, get_movie_detail as get_external_movie_detail
from scraper import async_background_enrich_movies, async_background_cache_posters
from scraper.ai_repair import async_background_ai_repair, get_repair_progress, ai_repair_single_item, _normalize_genre_str, _normalize_country_str
from poster_cache import download_and_cache_poster


router = APIRouter(prefix="/api", tags=["media"])


# ── Stats ───────────────────────────────────────────────────────────


@router.get("/media/stats")
async def media_stats(
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_user_db),
):
    """Return aggregated statistics for the current user's media library."""
    return get_media_stats(current_user["id"], db=db)


# ── Top Rated ────────────────────────────────────────────────────────


@router.get("/top-rated")
async def top_rated_list(
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_user_db),
):
    """Return top rated watched movies with pin/hide status."""
    return get_top_rated(current_user["id"], db=db)


@router.post("/top-rated/reorder")
async def top_rated_reorder(
    request: dict,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_user_db),
):
    """Reorder the top rated list.

    Accepts ``{"ordered_ids": [3, 1, 5, ...]}`` where the array
    specifies the new order of media item IDs.
    """
    ordered_ids = request.get("ordered_ids", [])
    if not isinstance(ordered_ids, list) or len(ordered_ids) == 0:
        raise HTTPException(status_code=400, detail="请提供有序的 ID 列表")
    reorder_top_rated(current_user["id"], ordered_ids, db=db)
    log_operation(current_user["id"], current_user["username"], "reorder_top_rated", f"排行榜重排: {len(ordered_ids)} 项", db=db)
    return {"status": "ok", "count": len(ordered_ids)}


@router.post("/top-rated/add")
async def top_rated_add(
    request: dict,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_user_db),
):
    """Add a media item to the top-rated list.

    Accepts ``{"media_id": 3}``.
    """
    media_id = request.get("media_id")
    if not isinstance(media_id, int):
        raise HTTPException(status_code=400, detail="请提供 media_id")
    result = add_to_top_rated(current_user["id"], media_id, db=db)
    if result is None:
        # Check whether the list is full (max 10)
        current_list = get_top_rated(current_user["id"], db=db)
        if len(current_list) >= 10:
            raise HTTPException(status_code=400, detail="排行榜最多10部，请先移除一部再添加")
        raise HTTPException(status_code=404, detail="媒体条目不存在")
    log_operation(current_user["id"], current_user["username"], "add_to_top_rated", f"添加到排行榜: {result['title']}", db=db)
    return {"status": "ok", "item": result}


@router.post("/top-rated/remove")
async def top_rated_remove(
    request: dict,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_user_db),
):
    """Remove a media item from the top-rated list.

    Accepts ``{"media_id": 3}``.
    """
    media_id = request.get("media_id")
    if not isinstance(media_id, int):
        raise HTTPException(status_code=400, detail="请提供 media_id")
    removed = remove_from_top_rated(current_user["id"], media_id, db=db)
    if not removed:
        raise HTTPException(status_code=404, detail="媒体条目不存在")
    log_operation(current_user["id"], current_user["username"], "remove_from_top_rated", f"从排行榜移除: ID {media_id}", db=db)
    return {"status": "ok"}


# ── Media CRUD ──────────────────────────────────────────────────────


@router.post("/media")
async def add_watched_media(
    request: WishlistItem,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_user_db),
):
    """Add a single media item to the watched list.

    Accepts a ``WishlistItem`` (title, year, genre) and creates a
    new record with ``status="watched"`` and ``rating=0``. Metadata
    enrichment runs asynchronously in the background, so the response
    returns immediately with the created record.

    **Duplicate prevention:**
    - If the title already exists in the wishlist → automatically
      converts it to watched (no duplicate created).
    - If the title already exists in watched → returns 409 Conflict.

    Unlike ``POST /media/replace`` this does **not** clear existing
    items — it appends to the watched list.
    """
    if not request.title or not request.title.strip():
        raise HTTPException(status_code=400, detail="标题不能为空")

    title = request.title.strip()

    # ── Duplicate check (TMDB ID priority, then title fallback) ──
    existing = get_media_by_title(
        title, current_user["id"],
        tmdb_id=request.tmdb_id,
        db=db,
    )
    if existing:
        if existing.status == "wish":
            # 已在想看 → 自动转为已看
            converted = mark_media_as_watched(
                media_id=existing.id,
                user_id=current_user["id"],
                rating=0.0,
                db=db,
            )
            if not converted:
                raise HTTPException(status_code=500, detail="转换失败")
            log_operation(
                current_user["id"], current_user["username"],
                "add_watched", f"从想看转为已看: {converted.title}", db=db,
            )
            return {
                "id": converted.id,
                "title": converted.title,
                "year": converted.year,
                "genre": converted.genre,
                "status": converted.status,
                "converted_from_wishlist": True,
            }
        else:
            # 已看中已存在 → 拒绝
            raise HTTPException(
                status_code=409,
                detail=f"「{title}」已在已看列表中",
            )

    records = save_media(
        [MediaRating(
            title=title,
            rating=0,
            year=request.year,
            genre=request.genre,
        )],
        current_user["id"],
        status="watched",
        db=db,
    )
    if not records:
        raise HTTPException(status_code=400, detail="添加失败")
    r = records[0]

    # Launch background metadata scraping for this single item
    background_tasks.add_task(async_background_enrich_movies, current_user["id"], [r.id])

    log_operation(
        current_user["id"], current_user["username"],
        "add_watched", f"添加已看: {r.title}", db=db,
    )
    return {
        "id": r.id,
        "title": r.title,
        "year": r.year,
        "genre": r.genre,
        "status": r.status,
    }


@router.post("/media/replace")
async def replace_media(
    request: MediaData,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_user_db),
):
    """Replace all watched media items for current user (clear + insert).

    Metadata enrichment (poster, overview, etc.) runs asynchronously
    in the background after the response is sent.
    """
    movies = parse_movie_data([m.model_dump() for m in request.movies])
    db_delete_media_by_status(current_user["id"], "watched", db=db)
    records = save_media(movies, current_user["id"], status="watched", db=db)

    # Launch background metadata scraping
    media_ids = [r.id for r in records]
    if media_ids:
        background_tasks.add_task(async_background_enrich_movies, current_user["id"], media_ids)

    log_operation(current_user["id"], current_user["username"], "replace_watched", f"替换已看列表: {len(records)} 部", db=db)
    return {"status": "saved", "count": len(records)}


@router.get("/media/titles")
async def list_media_titles(
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_user_db),
):
    """Lightweight endpoint: return just media titles for the current user."""
    titles = db_get_media_titles(current_user["id"], db=db)
    return {"titles": titles}


@router.get("/media")
async def list_media(
    search: str = "",
    page: int = 0,
    page_size: int = 50,
    status: str = "",
    sort_field: str = "created_at",
    sort_dir: str = "desc",
    rating_min: Optional[float] = None,
    rating_max: Optional[float] = None,
    has_error: Optional[bool] = Query(None, description="Filter by scrape error: True=only errors, None=all"),
    media_type: str = "",
    genre: str = "",
    country: str = "",
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_user_db),
):
    """List saved media items for current user. Optional filters: status ('watched'/'wish'), rating range, has_error, media_type ('movie'/'tv'), genre, country."""
    status_filter = status if status in ("watched", "wish") else None
    media_type_filter = media_type if media_type in ("movie", "tv") else None
    records, total = db_get_media(
        user_id=current_user["id"],
        search=search,
        page=page,
        page_size=page_size,
        status=status_filter,
        sort_field=sort_field,
        sort_dir=sort_dir,
        rating_min=rating_min,
        rating_max=rating_max,
        has_error=has_error,
        media_type=media_type_filter,
        genre=genre or None,
        country=country or None,
        db=db,
    )
    return {
        "media": [
            {
                "id": r.id,
                "title": r.title,
                "rating": r.rating,
                "year": r.year,
                "genre": r.genre,
                "status": r.status,
                "media_type": r.media_type,
                "poster_url": r.poster_url,
                "overview": r.overview,

                "runtime": r.runtime,
                "imdb_id": r.imdb_id,
                "tmdb_id": r.tmdb_id,
                "country": r.country,
                "tagline": r.tagline,
                "scrape_error": r.scrape_error,
                "tv_series_id": r.tv_series_id,
                "season_number": r.season_number,
                "episode_count": r.episode_count,
                "series_poster_url": r.series_poster_url,
                "created_at": r.created_at.isoformat(),
            }
            for r in records
        ],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@router.put("/media/{media_id}")
async def update_media_endpoint(
    media_id: int,
    data: dict,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_user_db),
):
    """Update a saved media item (must belong to current user)."""
    updated = db_update_media(
        media_id=media_id,
        user_id=current_user["id"],
        title=data.get("title"),
        rating=data.get("rating"),
        year=data.get("year"),
        genre=data.get("genre"),
        poster_url=data.get("poster_url"),
        overview=data.get("overview"),

        runtime=data.get("runtime"),
        imdb_id=data.get("imdb_id"),
        tmdb_id=data.get("tmdb_id"),
        country=data.get("country"),
        tagline=data.get("tagline"),
        media_type=data.get("media_type"),
        tv_series_id=data.get("tv_series_id"),
        season_number=data.get("season_number"),
        episode_count=data.get("episode_count"),
        series_poster_url=data.get("series_poster_url"),
        created_at=data.get("created_at"),
        db=db,
    )
    if not updated:
        raise HTTPException(status_code=404, detail="Media item not found")
    log_operation(current_user["id"], current_user["username"], "update_media", f"更新条目: {updated.title} (ID: {media_id})", db=db)
    return {
        "id": updated.id,
        "title": updated.title,
        "rating": updated.rating,
        "year": updated.year,
        "genre": updated.genre,
        "status": updated.status,
        "media_type": updated.media_type,
        "poster_url": updated.poster_url,
        "overview": updated.overview,
        "runtime": updated.runtime,
        "imdb_id": updated.imdb_id,
        "tmdb_id": updated.tmdb_id,
        "country": updated.country,
        "tagline": updated.tagline,
        "tv_series_id": updated.tv_series_id,
        "season_number": updated.season_number,
        "episode_count": updated.episode_count,
        "series_poster_url": updated.series_poster_url,
    }


@router.post("/media/{media_id}/enrich")
async def enrich_media_metadata_endpoint(
    media_id: int,
    source: str = Query("tmdb", pattern="^(tmdb|tvmaze)$", description="Search source: tmdb or tvmaze"),
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_user_db),
):
    """Scrape metadata from TMDB or TVmaze for a media item by its title and update the record."""
    media_item = get_media_for_user(media_id, current_user["id"], db=db)
    if not media_item:
        raise HTTPException(status_code=404, detail="Media item not found")

    try:
        results = search_external_movies(media_item.title, source)
    except RuntimeError as e:
        source_label = "TMDB" if source == "tmdb" else "TVmaze"
        raise HTTPException(status_code=502, detail=f"搜索 {source_label} 失败：{str(e)}")

    if not results:
        source_label = "TMDB" if source == "tmdb" else "TVmaze"
        raise HTTPException(
            status_code=404,
            detail=f"在 {source_label} 中未找到「{media_item.title}」的匹配结果，请先手动编辑标题再试",
        )

    # For items without a season_number, prefer movie search results to avoid
    # incorrectly tagging a movie as TV (e.g. "Interstellar" matching a TV
    # special/documentary on TMDB). TV results are only valid when the item
    # was explicitly imported as a TV series with a season marker.
    if media_item.season_number:
        # item is a TV series — prefer TV results, fall back to any result
        tv_results = [r for r in results if r.get("media_type") == "tv"]
        match = tv_results[0] if tv_results else results[0]
    else:
        movie_results = [r for r in results if r.get("media_type") != "tv"]
        match = movie_results[0] if movie_results else results[0]

    source_id = match.get("source_id", "")
    # Use the actual source from the match result (e.g. "tmdb" or "tvmaze")
    # instead of the user-requested source, because the search may have
    # returned a match from a different source than requested.
    match_source = match.get("source", source)
    if not source_id:
        raise HTTPException(status_code=502, detail=f"{match_source.upper()} 搜索结果缺少 source_id")

    # Pass media_type from search result so TV series use /tv/{id} instead of /movie/{id}
    media_type = match.get("media_type", "movie")
    # If the item already has a season_number persisted, pass it along so
    # the season-specific metadata (season poster, episode count) is refreshed
    season_number = media_item.season_number if media_type == "tv" else None
    try:
        detail = get_external_movie_detail(match_source, source_id, media_type=media_type, season_number=season_number)
    except RuntimeError as e:
        raise HTTPException(
            status_code=502,
            detail=f"获取 {match_source.upper()} 详情失败：{str(e)}。搜索已成功但获取详情失败，可能是 API 限流或网络问题。",
        )

    # Explicitly set media_type on the detail dict so that
    # enrich_media_metadata overwrites any previously incorrect value
    # in the database (e.g. a movie incorrectly tagged as "tv" from an
    # earlier scrape where a TV special matched the same title).
    # Movie detail (_get_tmdb_detail) doesn't include "media_type",
    # so without this the old DB value would persist.
    detail["media_type"] = media_type

    # Localize the poster image
    poster_cached = False
    if detail.get("poster_url"):
        local_url = download_and_cache_poster(
            detail["poster_url"],
            tmdb_id=detail.get("tmdb_id") or source_id,
        )
        if local_url:
            detail["poster_url"] = local_url
            poster_cached = True

    updated = db_enrich_media_metadata(media_id, current_user["id"], detail, db=db)
    if not updated:
        raise HTTPException(status_code=404, detail="Media item not found")

    # Reconcile scrape_error
    if poster_cached or not detail.get("poster_url"):
        db_clear_scrape_error(media_id, current_user["id"], db=db)
    else:
        db_set_scrape_error(
            media_id, current_user["id"],
            "海报图片下载失败，已保留原始 TMDB 地址。可稍后重试「批量刮削」以缓存到本地",
            db=db,
        )

    return {
        "id": updated.id,
        "title": updated.title,
        "rating": updated.rating,
        "year": updated.year,
        "genre": updated.genre,
        "status": updated.status,
        "poster_url": updated.poster_url,
        "overview": updated.overview,
        "runtime": updated.runtime,
        "imdb_id": updated.imdb_id,
        "tmdb_id": updated.tmdb_id,
        "country": updated.country,
        "tagline": updated.tagline,
        "scrape_error": updated.scrape_error,
        "tv_series_id": updated.tv_series_id,
        "season_number": updated.season_number,
        "episode_count": updated.episode_count,
        "series_poster_url": updated.series_poster_url,
    }


@router.post("/media/{media_id}/mark-watched")
async def mark_as_watched(
    media_id: int,
    request: MarkAsWatchedRequest,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_user_db),
):
    """Move a wishlist item to watched with a rating."""
    updated = mark_media_as_watched(
        media_id=media_id,
        user_id=current_user["id"],
        rating=request.rating,
        db=db,
    )
    if not updated:
        raise HTTPException(
            status_code=404,
            detail="Media item not found or already marked as watched",
        )
    log_operation(current_user["id"], current_user["username"], "mark_watched", f"标记已看: {updated.title}", db=db)
    return {
        "id": updated.id,
        "title": updated.title,
        "rating": updated.rating,
        "year": updated.year,
        "genre": updated.genre,
        "status": updated.status,
    }


@router.delete("/media/{media_id}")
async def delete_media_endpoint(
    media_id: int,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_user_db),
):
    """Delete a saved media item (must belong to current user)."""
    deleted = db_delete_media(media_id, current_user["id"], db=db)
    if not deleted:
        raise HTTPException(status_code=404, detail="Media item not found")
    log_operation(current_user["id"], current_user["username"], "delete_media", f"删除条目 ID: {media_id}", db=db)
    return {"status": "deleted"}


@router.post("/media/batch-delete")
async def batch_delete_media_endpoint(
    request: dict,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_user_db),
):
    """Batch delete media items by IDs."""
    ids = request.get("ids", [])
    if not isinstance(ids, list) or len(ids) == 0:
        raise HTTPException(status_code=400, detail="请提供要删除的条目 ID 列表")
    count = db_batch_delete_media(ids, current_user["id"], db=db)
    log_operation(current_user["id"], current_user["username"], "batch_delete_media", f"批量删除: {count} 条", db=db)
    return {"status": "deleted", "count": count}


@router.get("/media/enrich-status")
async def get_enrich_status(
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_user_db),
):
    """Get the status of background metadata enrichment for the current user.

    "Processed" means the item either has a poster_url (success) or has
    a scrape_error set (failure — TMDB couldn't find a match, etc.).
    "Pending" = total - processed, so it reaches 0 even for unmatched films.
    """
    total, processed, failed = db_get_enrich_progress(current_user["id"], db=db)
    return {
        "total": total,
        "enriched": processed - failed,
        "failed": failed,
        "processed": processed,
        "pending": total - processed,
    }


@router.post("/media/enrich-all")
async def enrich_all_media(
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_user_db),
):
    """Launch background metadata scraping for all media items without posters.

    Finds all items for the current user that don't have a ``poster_url``
    yet, then enqueues a background task to scrape their metadata from
    TMDB. Returns immediately — the scraping runs asynchronously.
    """
    media_ids = db_get_unenriched_media_ids(current_user["id"], db=db)
    if not media_ids:
        return {"status": "ok", "enqueued": 0, "message": "All items already have metadata"}

    background_tasks.add_task(async_background_enrich_movies, current_user["id"], media_ids)
    log_operation(current_user["id"], current_user["username"], "enrich_all", f"批量刮削: {len(media_ids)} 条", db=db)
    return {"status": "ok", "enqueued": len(media_ids)}


@router.post("/media/cache-posters")
async def cache_posters(
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_user_db),
):
    """Download and cache posters for items that already have TMDB CDN URLs but haven't been cached locally yet."""
    items = db_get_external_poster_media_ids(current_user["id"], db=db)
    if not items:
        return {"status": "ok", "enqueued": 0, "message": "All posters already cached locally"}

    background_tasks.add_task(async_background_cache_posters, current_user["id"], items)
    log_operation(current_user["id"], current_user["username"], "cache_posters", f"缓存海报: {len(items)} 条", db=db)
    return {"status": "ok", "enqueued": len(items)}


@router.delete("/media")
async def delete_all_media_endpoint(
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_user_db),
):
    """Delete all saved media items for current user."""
    count = delete_all_media_for_user(current_user["id"], db=db)
    log_operation(current_user["id"], current_user["username"], "clear_all_media", f"清空所有条目: {count} 条", db=db)
    return {"status": "deleted", "count": count}


# ── Media Filters (countries & genres for filter dropdowns) ─────────



@router.get("/media/filters")
async def media_filters(
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_user_db),
):
    """Return all unique countries and genres across the current user's media library.

    Used by the frontend to populate filter dropdowns with the full set
    of available options, regardless of pagination.
    """
    from sqlmodel import select
    from models import MediaItemRecord

    records = db.exec(
        select(MediaItemRecord.country, MediaItemRecord.genre).where(
            MediaItemRecord.user_id == current_user["id"]
        )
    ).all()

    countries_set: set[str] = set()
    countries_seen: set[str] = set()
    genres_set: set[str] = set()
    genres_seen: set[str] = set()

    for country, genre in records:
        if country:
            for c in country.split("/"):
                c = c.strip()
                if c:
                    # Normalise Chinese country names to canonical English
                    canonical = NORMALIZE_COUNTRY.get(c, c)
                    if canonical.lower() not in countries_seen:
                        countries_seen.add(canonical.lower())
                        countries_set.add(canonical)
        if genre:
            # Normalize: replace all "/" and "," with " / " then split
            # Handles inconsistent separators like "Action/Adventure",
            # "Action / Adventure", "Action, Adventure" etc.
            normalized = genre.replace("/", " / ").replace(",", " / ")
            for g in normalized.split(" / "):
                g = g.strip()
                if not g:
                    continue
                # Normalise variant / translated names to canonical English
                canonical = NORMALIZE_GENRE.get(g, g)
                if canonical.lower() not in genres_seen:
                    genres_seen.add(canonical.lower())
                    genres_set.add(canonical)

    return {
        "countries": sorted(countries_set),
        "genres": sorted(genres_set),
    }


# ── External Media Search ───────────────────────────────────────────


@router.get("/media/search")
async def search_media(
    q: str = Query(..., min_length=1, description="Search query"),
    source: str = Query("auto", pattern="^(tmdb|tvmaze|auto)$", description="Data source: tmdb, tvmaze, or auto"),
    media_type: str = Query("", pattern="^(movie|tv|)$", description="Optional filter: movie or tv"),
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_user_db),
):
    """Search for movies/TV via external sources (TMDB / TVmaze)."""
    try:
        media_type_filter = media_type if media_type in ("movie", "tv") else None
        results = search_external_movies(q, source, media_type=media_type_filter)
        log_operation(current_user["id"], current_user["username"], "search", f"搜索: {q} (来源: {source}, 类型: {media_type_filter or '全部'})", db=db)
        return {"results": results}
    except RuntimeError as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.post("/media/{media_id}/rematch")
async def rematch_media(
    media_id: int,
    request: dict,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_user_db),
):
    """Manually rematch a media item to a specific search result.

    Accepts ``{"source": "tmdb", "source_id": "12345"}``, fetches
    the full detail from the source, updates the metadata fields
    (poster, overview, runtime, etc.), clears ``scrape_error``,
    and downloads+caches the poster locally.
    """
    source = request.get("source", "")
    source_id = request.get("source_id", "")
    media_type = request.get("media_type", "movie")
    if not source or not source_id:
        raise HTTPException(status_code=400, detail="需要提供 source 和 source_id")
    if source not in ("tmdb", "tvmaze"):
        raise HTTPException(status_code=400, detail="source 只能是 tmdb 或 tvmaze")

    media_item = get_media_for_user(media_id, current_user["id"], db=db)
    if not media_item:
        raise HTTPException(status_code=404, detail="Media item not found")

    try:
        detail = get_external_movie_detail(source, source_id, media_type=media_type)
    except RuntimeError as e:
        raise HTTPException(status_code=502, detail=str(e))

    # Explicitly set media_type so enrich_media_metadata overwrites
    # any previously incorrect value in the database
    detail["media_type"] = media_type

    # Download and cache poster locally
    poster_cached = False
    if detail.get("poster_url"):
        local_url = download_and_cache_poster(
            detail["poster_url"],
            tmdb_id=detail.get("tmdb_id") or source_id,
        )
        if local_url:
            detail["poster_url"] = local_url
            poster_cached = True

    # Update metadata fields (preserves user's title/year)
    updated = db_enrich_media_metadata(media_id, current_user["id"], detail, db=db)
    if not updated:
        raise HTTPException(status_code=404, detail="Media item not found")

    # Clear scrape_error on success
    db_clear_scrape_error(media_id, current_user["id"], db=db)

    log_operation(current_user["id"], current_user["username"], "rematch_media", f"手动匹配: {updated.title}", db=db)
    return {
        "id": updated.id,
        "title": updated.title,
        "rating": updated.rating,
        "year": updated.year,
        "genre": updated.genre,
        "status": updated.status,
        "poster_url": updated.poster_url,
        "overview": updated.overview,
        "runtime": updated.runtime,
        "imdb_id": updated.imdb_id,
        "tmdb_id": updated.tmdb_id,
        "country": updated.country,
        "tagline": updated.tagline,
        "scrape_error": updated.scrape_error,
        "tv_series_id": updated.tv_series_id,
        "season_number": updated.season_number,
        "episode_count": updated.episode_count,
        "series_poster_url": updated.series_poster_url,
    }


@router.get("/media/detail")
async def media_detail(
    source: str = Query(..., pattern="^(tmdb|tvmaze)$", description="Data source: tmdb or tvmaze"),
    source_id: str = Query(..., min_length=1, description="Media ID from the source"),
    media_type: str = Query("movie", pattern="^(movie|tv)$", description="Media type: movie or tv"),
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_user_db),
):
    """Fetch full media details from external source."""
    try:
        detail = get_external_movie_detail(source, source_id, media_type=media_type)
        log_operation(current_user["id"], current_user["username"], "media_detail", f"查看详情: {detail.get('title', '')}", db=db)
        return detail
    except RuntimeError as e:
        raise HTTPException(status_code=502, detail=str(e))


# ── AI Repair ───────────────────────────────────────────────────────


@router.post("/media/ai-repair")
async def ai_repair_endpoint(
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_user_db),
):
    """Launch AI-powered data repair in the background.

    Runs two passes:
    1. **Missing fields**: AI infers genre/country for items missing these fields
    2. **Duplicate detection**: AI identifies potential cross-language duplicates

    Returns immediately — the repair runs asynchronously.
    The frontend can poll ``GET /api/media/ai-repair/status`` for progress.
    """
    background_tasks.add_task(async_background_ai_repair, current_user["id"], "all")
    log_operation(
        current_user["id"], current_user["username"],
        "ai_repair", "启动 AI 数据修复", db=db,
    )
    return {"status": "ok", "message": "AI 修复已启动，正在后台运行"}


@router.post("/media/{media_id}/ai-infer")
async def ai_infer_single(
    media_id: int,
    request: dict = {},
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_user_db),
):
    """Use AI to infer genre/country for a single media item.

    **Two modes:**

    1. **Infer only** (no ``apply`` in body):
       - Always calls AI regardless of existing data
       - If AI result differs from existing → returns ``needs_review: true``
         with both existing + AI values (no DB write)
       - If fields are missing → auto-applies AI result (backward-compatible)

    2. **Apply confirmed fields** (``{"apply": {"genre": "...", "country": "..."}}``):
       - Directly writes the specified fields without calling AI
       - Used after user confirms in the diff modal

    Unlike the batch ``POST /media/ai-repair``, this runs synchronously.
    """
    media_item = get_media_for_user(media_id, current_user["id"], db=db)
    if not media_item:
        raise HTTPException(status_code=404, detail="Media item not found")

    existing_genre = media_item.genre
    existing_country = media_item.country

    # ── Mode 2: Direct apply ──
    apply = request.get("apply")
    if apply is not None:
        payload = {}
        if "genre" in apply:
            payload["genre"] = apply["genre"]
        if "country" in apply:
            payload["country"] = apply["country"]
        updated = False
        if payload:
            try:
                updated_record = db_update_media(
                    media_id=media_id,
                    user_id=current_user["id"],
                    db=db,
                    **payload,
                )
                if updated_record:
                    updated = True
                    log_operation(
                        current_user["id"], current_user["username"],
                        "ai_infer_apply",
                        f"AI 推断确认应用: {media_item.title} → genre={payload.get('genre', '—')}, country={payload.get('country', '—')}",
                        db=db,
                    )
            except Exception as e:
                raise HTTPException(status_code=500, detail=f"应用失败: {str(e)}")
        return {
            "id": media_item.id,
            "title": media_item.title,
            "genre": updated_record.genre if (updated and payload.get("genre")) else existing_genre,
            "country": updated_record.country if (updated and payload.get("country")) else existing_country,
            "existing_genre": existing_genre,
            "existing_country": existing_country,
            "ai_genre": None,
            "ai_country": None,
            "needs_review": False,
            "updated": updated,
            "message": "AI 推断已应用" if updated else "未做任何更改",
        }

    # ── Mode 1: Always infer ──
    result = ai_repair_single_item(media_item.title, media_item.year, media_item.genre, media_item.country)
    ai_genre = result.get("genre")
    ai_country = result.get("country")

    # Check if existing data differs from AI suggestion
    # Normalize both sides so Chinese ↔ English doesn't trigger a false diff
    normalized_existing_genre = _normalize_genre_str(existing_genre) if existing_genre else None
    genre_differs = (
        existing_genre and ai_genre
        and existing_genre != ai_genre
        and normalized_existing_genre != ai_genre
    )
    normalized_existing_country = _normalize_country_str(existing_country)
    country_differs = (
        existing_country and ai_country
        and existing_country != ai_country
        and normalized_existing_country != ai_country
    )

    if genre_differs or country_differs:
        # Needs review — return both values, don't write
        return {
            "id": media_item.id,
            "title": media_item.title,
            "genre": existing_genre,
            "country": existing_country,
            "existing_genre": existing_genre,
            "existing_country": existing_country,
            "ai_genre": ai_genre,
            "ai_country": ai_country,
            "needs_review": True,
            "updated": False,
            "message": "AI 推断结果与现有数据不同，请确认",
        }

    # Auto-apply for missing fields (no existing data to overwrite)
    needs_genre = not existing_genre
    needs_country = not existing_country
    payload = {}
    if needs_genre and ai_genre:
        payload["genre"] = ai_genre
    if needs_country and ai_country:
        payload["country"] = ai_country

    updated = False
    if payload:
        try:
            updated_record = db_update_media(
                media_id=media_id,
                user_id=current_user["id"],
                db=db,
                **payload,
            )
            if updated_record:
                updated = True
                log_operation(
                    current_user["id"], current_user["username"],
                    "ai_infer_single",
                    f"AI 推断: {media_item.title} → genre={payload.get('genre', '—')}, country={payload.get('country', '—')}",
                    db=db,
                )
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"更新失败: {str(e)}")

    final_genre = payload.get("genre") if needs_genre else existing_genre
    final_country = payload.get("country") if needs_country else existing_country
    return {
        "id": media_item.id,
        "title": media_item.title,
        "genre": final_genre,
        "country": final_country,
        "existing_genre": existing_genre,
        "existing_country": existing_country,
        "ai_genre": ai_genre,
        "ai_country": ai_country,
        "needs_review": False,
        "updated": updated,
        "message": "AI 推断完成" if updated else "AI 未能推断出可靠结果",
    }


@router.get("/media/ai-repair/status")
async def ai_repair_status(
    current_user: dict = Depends(get_current_user),
):
    """Get the current progress of the AI repair task for the current user.

    Returns ``null`` if no repair is running or the last repair has expired.

    Progress dict:
        ``status`` (str): ``"running"``, ``"done"``, or ``"error"``
        ``step`` (str): current step name
        ``message`` (str): human-readable status message
        ``total`` (int): total items to process in this step
        ``current`` (int): items processed so far
    """
    progress = get_repair_progress(current_user["id"])
    if progress is None:
        return {"status": None, "step": "", "message": "", "total": 0, "current": 0}
    return progress


# ── Media Diagnostics ────────────────────────────────────────────────


@router.get("/media/diagnostics")
async def media_diagnostics(
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_user_db),
):
    """Run diagnostics on the current user's media library.

    Checks each media item for missing metadata fields, scrape errors,
    and TMDB ID issues. Returns both summary counts and the full item list
    with per-item missing fields.
    """
    from sqlmodel import select
    from models import MediaItemRecord

    records = db.exec(
        select(MediaItemRecord).where(MediaItemRecord.user_id == current_user["id"])
    ).all()

    total = len(records)

    # Define which fields are "important" metadata for diagnostics
    METADATA_FIELDS = [
        ("poster_url", "海报"),
        ("overview", "简介"),

        ("runtime", "时长"),
        ("tmdb_id", "TMDB ID"),
        ("country", "国家"),
    ]

    # Per-field counters
    field_missing: dict[str, int] = {f: 0 for f, _ in METADATA_FIELDS}

    items: list[dict] = []
    for r in records:
        missing_fields: list[dict] = []

        for attr, label in METADATA_FIELDS:
            val = getattr(r, attr, None)
            if val is None or (isinstance(val, str) and val.strip() == ""):
                field_missing[attr] += 1
                missing_fields.append({"field": attr, "label": label})

        # TV-specific: also check series_poster_url and episode_count for TV items
        if r.media_type == "tv":
            if not r.series_poster_url:
                missing_fields.append({"field": "series_poster_url", "label": "剧集海报"})
            if not r.episode_count:
                missing_fields.append({"field": "episode_count", "label": "集数"})
                field_missing["episode_count"] = field_missing.get("episode_count", 0) + 1

        if not missing_fields and not r.scrape_error:
            continue  # skip fully healthy items

        items.append({
            "id": r.id,
            "title": r.title,
            "year": r.year,
            "media_type": r.media_type,
            "status": r.status,
            "rating": r.rating,
            "missing_fields": missing_fields,
            "missing_count": len(missing_fields),
            "has_scrape_error": r.scrape_error is not None,
            "scrape_error": r.scrape_error,
            "poster_url": r.poster_url,
            "overview": r.overview,
            "genre": r.genre,
            "runtime": r.runtime,
            "imdb_id": r.imdb_id,
            "tmdb_id": r.tmdb_id,
            "country": r.country,
            "tagline": r.tagline,
            "tv_series_id": r.tv_series_id,
            "season_number": r.season_number,
            "episode_count": r.episode_count,
            "series_poster_url": r.series_poster_url,
            "created_at": r.created_at.isoformat() if r.created_at else "",
        })

    # Sort: items with scrape errors first, then by missing count desc, then by title
    items.sort(key=lambda x: (
        0 if x["has_scrape_error"] else 1,
        -x["missing_count"],
        x["title"].lower(),
    ))

    # Build summary
    summary = {
        "total": total,
        "healthy": total - len(items),
        "has_issues": len(items),
    }
    for attr, label in METADATA_FIELDS:
        summary[f"missing_{attr}"] = field_missing.get(attr, 0)

    # Count items with scrape errors
    summary["has_scrape_error"] = sum(1 for r in records if r.scrape_error is not None)
    # Count items without tmdb_id
    summary["missing_tmdb_id"] = sum(1 for r in records if not r.tmdb_id)
    # Count items without poster
    summary["missing_poster_url"] = sum(1 for r in records if not r.poster_url)
    # Count TV items missing episode count
    summary["missing_episode_count"] = field_missing.get("episode_count", 0)

    return {
        "summary": summary,
        "items": items,
    }


# ── Wishlist ────────────────────────────────────────────────────────


@router.post("/wishlist/replace")
async def replace_wishlist(
    request: WishlistData,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_user_db),
):
    """Replace all wishlist items for current user (clear + insert).

    Metadata enrichment runs asynchronously in the background.
    """
    items = []
    for m in request.movies:
        if not m.title or not m.title.strip():
            continue
        items.append(
            WishlistItem(
                title=m.title.strip(),
                year=m.year,
                genre=m.genre,
            )
        )
    db_delete_media_by_status(current_user["id"], "wish", db=db)
    records = save_wishlist_items(items, current_user["id"], db=db)

    # Launch background metadata scraping
    media_ids = [r.id for r in records]
    if media_ids:
        background_tasks.add_task(async_background_enrich_movies, current_user["id"], media_ids)

    log_operation(current_user["id"], current_user["username"], "replace_wishlist", f"替换想看列表: {len(records)} 条", db=db)
    return {"status": "saved", "count": len(records)}


@router.post("/wishlist")
async def add_to_wishlist(
    request: WishlistItem,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_user_db),
):
    """Add a single media item to the wishlist.

    **Duplicate prevention:** if the title already exists in either
    the watched or wishlist, returns 409 Conflict.

    Metadata enrichment runs asynchronously in the background.
    """
    if not request.title or not request.title.strip():
        raise HTTPException(status_code=400, detail="标题不能为空")

    # ── Duplicate check (TMDB ID priority, then title fallback) ──
    existing = get_media_by_title(
        request.title.strip(), current_user["id"],
        tmdb_id=request.tmdb_id,
        db=db,
    )
    if existing:
        status_label = "已看" if existing.status == "watched" else "想看"
        raise HTTPException(
            status_code=409,
            detail=f"「{request.title}」已在{status_label}列表中",
        )

    records = save_wishlist_items([request], current_user["id"], db=db)
    if not records:
        raise HTTPException(status_code=400, detail="Failed to add item")
    r = records[0]

    # Launch background metadata scraping for this single item
    background_tasks.add_task(async_background_enrich_movies, current_user["id"], [r.id])

    log_operation(current_user["id"], current_user["username"], "add_to_wishlist", f"添加到想看: {r.title}", db=db)
    return {
        "id": r.id,
        "title": r.title,
        "year": r.year,
        "genre": r.genre,
        "status": r.status,
    }


@router.post("/wishlist/import")
async def import_wishlist(
    request: WishlistData,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_user_db),
):
    """Append items to the wishlist (no clearing of existing items).

    **Duplicate prevention:** items whose titles already exist in
    either watched or wishlist are silently skipped.

    Unlike ``POST /wishlist/replace``, this endpoint does **not** delete
    existing wishlist items first — it only inserts the new ones. This
    is the correct endpoint for JSON import, merging import files with
    existing data without discarding items on other pages.

    Metadata enrichment runs asynchronously in the background.
    """
    items = []
    skipped = 0
    for m in request.movies:
        if not m.title or not m.title.strip():
            continue
        title = m.title.strip()
        # Skip if already exists in either list (TMDB ID priority, then title fallback)
        existing = get_media_by_title(
            title, current_user["id"],
            tmdb_id=m.tmdb_id,
            db=db,
        )
        if existing:
            skipped += 1
            continue
        items.append(
            WishlistItem(
                title=title,
                year=m.year,
                genre=m.genre,
            )
        )
    if not items:
        return {"status": "saved", "count": 0, "skipped": skipped}

    records = save_wishlist_items(items, current_user["id"], db=db)

    media_ids = [r.id for r in records]
    if media_ids:
        background_tasks.add_task(async_background_enrich_movies, current_user["id"], media_ids)

    log_operation(current_user["id"], current_user["username"], "import_wishlist", f"导入想看列表: {len(records)} 条（跳过 {skipped} 条重复）", db=db)
    return {"status": "saved", "count": len(records), "skipped": skipped}


@router.delete("/wishlist")
async def clear_wishlist(
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_user_db),
):
    """Delete all wishlist items for current user."""
    count = db_delete_media_by_status(current_user["id"], "wish", db=db)
    log_operation(current_user["id"], current_user["username"], "clear_wishlist", f"清空想看列表: {count} 条", db=db)
    return {"status": "deleted", "count": count}
