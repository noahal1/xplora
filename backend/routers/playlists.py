"""Playlist (片单) endpoints — authenticated CRUD + public read-only share view."""

import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session

logger = logging.getLogger(__name__)

from auth import get_current_user
from deps import get_user_db
from helpers import iso_utc
from crud import (
    log_operation,
    create_playlist,
    get_playlist,
    get_playlist_by_token,
    list_playlists,
    update_playlist,
    delete_playlist,
    enable_share,
    disable_share,
    list_items,
    playlist_items_contain_item,
    add_playlist_item,
    update_playlist_item,
    delete_playlist_item,
    reorder_playlist_items,
)
from models import (
    PlaylistCreate,
    PlaylistUpdate,
    PlaylistItemInput,
    PlaylistItemUpdate,
    PlaylistReorderRequest,
    PlaylistAINameRequest,
    PlaylistCategorizeRequest,
    PlaylistCompleteRequest,
)

router = APIRouter(prefix="/api", tags=["playlists"])


# ── Serialization helpers ──────────────────────────────────────────


def _item_to_dict(item) -> dict:
    return {
        "id": item.id,
        "media_id": item.media_id,
        "title": item.title,
        "year": item.year,
        "genre": item.genre,
        "media_type": item.media_type,
        "poster_url": item.poster_url,
        "overview": item.overview,
        "tmdb_id": item.tmdb_id,
        "country": item.country,
        "note": item.note,
        "sort_order": item.sort_order,
        "created_at": iso_utc(item.created_at),
    }


def _playlist_to_dict(playlist) -> dict:
    return {
        "id": playlist.id,
        "name": playlist.name,
        "description": playlist.description,
        "cover_url": playlist.cover_url,
        "share_token": playlist.share_token,
        "created_at": iso_utc(playlist.created_at),
        "updated_at": iso_utc(playlist.updated_at),
    }


def _playlist_detail_dict(playlist, items) -> dict:
    data = _playlist_to_dict(playlist)
    data["item_count"] = len(items)
    data["items"] = [_item_to_dict(i) for i in items]
    return data


def _public_item_to_dict(item) -> dict:
    """Minimal serializer for the anonymous share view — never exposes
    internal IDs (media_id / item id / created_at)."""
    return {
        "title": item.title,
        "year": item.year,
        "genre": item.genre,
        "media_type": item.media_type,
        "poster_url": item.poster_url,
        "overview": item.overview,
        "tmdb_id": item.tmdb_id,
        "country": item.country,
        "note": item.note,
        "sort_order": item.sort_order,
    }


# ── AI helpers ──────────────────────────────────────────────────────


def _get_ai_service(model: str, user_id: int):
    """Build an AIService, falling back to another configured model.

    Returns ``(service, resolved_model)``. Raises 503 when no configured
    model has an API key.
    """
    from helpers import get_api_key
    from config_manager import get_api_key as get_config_api_key
    from ai_service import AIService
    from ai_service.constants import AI_MODEL_ORDER, MODEL_CONFIGS

    valid = {m for m in AI_MODEL_ORDER if m in MODEL_CONFIGS}
    model = model if model in valid else "deepseek"
    try:
        api_key = get_api_key(model)
    except HTTPException:
        # Requested model has no key — try the other configured models in order
        for fallback in AI_MODEL_ORDER:
            if fallback == model or fallback not in valid:
                continue
            if MODEL_CONFIGS[fallback].get("requires_key") is False or get_config_api_key(fallback):
                model = fallback
                api_key = get_api_key(fallback)
                break
        else:
            raise HTTPException(status_code=503, detail="未配置 AI API Key，请先在设置页面或 .env 文件中配置")

    service = AIService(api_key=api_key, model_type=model, user_id=user_id)
    return service, model


def _run_ai(fn):
    """Run an AI service call, converting our RuntimeError failures into
    a clean 502 response so the frontend can show the real reason (instead
    of the misleading "no suitable playlist" empty result)."""
    try:
        return fn()
    except RuntimeError as e:
        logger.warning("AI playlist call failed: %s", e)
        raise HTTPException(status_code=502, detail=str(e)) from e


# ── AI playlist name ────────────────────────────────────────────────


@router.post("/playlists/ai-name")
def generate_playlist_name_endpoint(
    request: PlaylistAINameRequest,
    current_user: dict = Depends(get_current_user),
):
    """Generate playlist name candidates AND famous director/actor people
    playlist suggestions using AI based on a single movie — one combined call.

    Lets the user create a new playlist from a single movie without
    having to think up a name — the AI invents fitting collection names
    (e.g. adding 《盗梦空间》 → 「高分科幻精选」「周末观影清单」) and, in the same
    prompt, detects whether the movie is by a globally famous director/actor
    (e.g. → 「诺兰导演作品」). ``people`` is empty when no famous
    director/actor is associated with the movie.

    Falls back to the other configured model if the requested one has no
    API key configured.
    """
    service, model = _get_ai_service(request.model, current_user["id"])
    result = _run_ai(lambda: service.generate_playlist_names(
        {
            "title": request.title,
            "year": request.year,
            "genre": request.genre,
            "overview": request.overview,
            "media_type": request.media_type,
        },
        lang=request.lang or "zh",
        count=3,
    ))
    return {
        "names": result.get("names", []),
        "people": result.get("people", []),
        "model_used": model,
    }


# ── AI categorize / complete ────────────────────────────────────────


def _playlist_with_items(playlist, items) -> dict:
    """Convert a playlist + its items into a plain dict for AI prompts."""
    return {
        "id": playlist.id,
        "name": playlist.name,
        "description": playlist.description,
        "items": [
            {
                "title": i.title,
                "year": i.year,
                "genre": i.genre,
                "media_type": i.media_type,
                "tmdb_id": i.tmdb_id,
            }
            for i in items
        ],
    }


@router.post("/playlists/ai-categorize")
def categorize_playlist_endpoint(
    request: PlaylistCategorizeRequest,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_user_db),
):
    """AI 智能归类 — suggest which existing playlist(s) a movie fits best.

    Returns the top 3 playlist suggestions (with reasons + confidence)
    so the frontend can offer one-click add buttons.
    """
    playlists = list_playlists(current_user["id"], db)
    if not playlists:
        return {"suggestions": [], "model_used": request.model or "deepseek", "reason": "no_playlists"}
    playlist_dicts = [
        _playlist_with_items(p, list_items(p.id, db))
        for p in playlists
    ]
    service, model = _get_ai_service(request.model, current_user["id"])
    suggestions = _run_ai(lambda: service.categorize_playlist(
        {
            "title": request.title,
            "year": request.year,
            "genre": request.genre,
            "overview": request.overview,
            "media_type": request.media_type,
        },
        playlist_dicts,
        lang=request.lang or "zh",
    ))
    return {"suggestions": suggestions, "model_used": model}


@router.post("/playlists/{playlist_id}/ai-complete")
def complete_playlist_endpoint(
    playlist_id: int,
    request: PlaylistCompleteRequest,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_user_db),
):
    """AI 补齐计划 — recommend items a playlist is missing.

    Infers the playlist's theme from its existing items and recommends
    fitting additions (using the TMDB hybrid candidate pool when
    available). Each suggestion can be added individually by the user.
    """
    playlist = get_playlist(current_user["id"], playlist_id, db)
    if not playlist:
        raise HTTPException(status_code=404, detail="片单不存在")
    items = list_items(playlist_id, db)
    playlist_dict = _playlist_with_items(playlist, items)
    service, model = _get_ai_service(request.model, current_user["id"])
    suggestions = _run_ai(lambda: service.complete_playlist(
        playlist_dict,
        count=request.count,
        lang=request.lang or "zh",
    ))
    return {"suggestions": suggestions, "model_used": model}


# ── Authenticated CRUD ─────────────────────────────────────────────


@router.get("/playlists")
async def get_playlists(
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_user_db),
    item_media_id: Optional[int] = None,
    item_tmdb_id: Optional[str] = None,
    item_title: Optional[str] = None,
    item_year: Optional[int] = None,
):
    """List all playlists for the current user (with item counts + covers).

    When any ``item_*`` query param is provided, each playlist is also
    flagged with ``item_included`` = True if it already contains that item
    (matched by media_id, tmdb_id, or title+year) — lets the
    add-to-playlist modal show "已添加" instead of an add button.
    """
    playlists = list_playlists(current_user["id"], db)
    check_item = (
        item_media_id is not None
        or bool(item_tmdb_id)
        or bool(item_title and item_title.strip())
    )
    result = []
    for p in playlists:
        data = _playlist_to_dict(p)
        items = list_items(p.id, db)
        data["item_count"] = len(items)
        if check_item:
            data["item_included"] = playlist_items_contain_item(
                items,
                media_id=item_media_id,
                tmdb_id=item_tmdb_id,
                title=item_title,
                year=item_year,
            )
        result.append(data)
    return {"playlists": result, "total": len(result)}


@router.post("/playlists")
async def create_playlist_endpoint(
    request: PlaylistCreate,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_user_db),
):
    """Create a new playlist."""
    if not request.name or not request.name.strip():
        raise HTTPException(status_code=400, detail="片单名称不能为空")
    playlist = create_playlist(
        current_user["id"],
        request.name,
        description=request.description,
        db=db,
    )
    log_operation(
        current_user["id"], current_user["username"],
        "create_playlist", f"创建片单: {playlist.name}", db=db,
    )
    return _playlist_detail_dict(playlist, [])


@router.get("/playlists/{playlist_id}")
async def get_playlist_detail(
    playlist_id: int,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_user_db),
):
    """Get a single playlist with its items."""
    playlist = get_playlist(current_user["id"], playlist_id, db)
    if not playlist:
        raise HTTPException(status_code=404, detail="片单不存在")
    return _playlist_detail_dict(playlist, list_items(playlist_id, db))


@router.put("/playlists/{playlist_id}")
async def update_playlist_endpoint(
    playlist_id: int,
    request: PlaylistUpdate,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_user_db),
):
    """Rename / update a playlist's metadata."""
    updated = update_playlist(
        current_user["id"],
        playlist_id,
        name=request.name,
        description=request.description,
        db=db,
    )
    if not updated:
        raise HTTPException(status_code=404, detail="片单不存在")
    log_operation(
        current_user["id"], current_user["username"],
        "update_playlist", f"更新片单: {updated.name}", db=db,
    )
    return _playlist_detail_dict(updated, list_items(playlist_id, db))


@router.delete("/playlists/{playlist_id}")
async def delete_playlist_endpoint(
    playlist_id: int,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_user_db),
):
    """Delete a playlist and all its items."""
    playlist = get_playlist(current_user["id"], playlist_id, db)
    if not playlist:
        raise HTTPException(status_code=404, detail="片单不存在")
    delete_playlist(current_user["id"], playlist_id, db)
    log_operation(
        current_user["id"], current_user["username"],
        "delete_playlist", f"删除片单: {playlist.name}", db=db,
    )
    return {"status": "deleted"}


# ── Sharing ────────────────────────────────────────────────────────


@router.post("/playlists/{playlist_id}/share")
async def share_playlist_endpoint(
    playlist_id: int,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_user_db),
):
    """Enable sharing — generates (or returns the existing) share token."""
    playlist = get_playlist(current_user["id"], playlist_id, db)
    if not playlist:
        raise HTTPException(status_code=404, detail="片单不存在")
    token = enable_share(current_user["id"], playlist_id, db)
    if not token:
        raise HTTPException(status_code=404, detail="片单不存在")
    log_operation(
        current_user["id"], current_user["username"],
        "share_playlist", f"开启片单分享: {playlist.name}", db=db,
    )
    return {"status": "ok", "share_token": token}


@router.delete("/playlists/{playlist_id}/share")
async def unshare_playlist_endpoint(
    playlist_id: int,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_user_db),
):
    """Disable sharing — revokes the share token."""
    playlist = get_playlist(current_user["id"], playlist_id, db)
    if not playlist:
        raise HTTPException(status_code=404, detail="片单不存在")
    disable_share(current_user["id"], playlist_id, db)
    log_operation(
        current_user["id"], current_user["username"],
        "unshare_playlist", f"关闭片单分享: {playlist.name}", db=db,
    )
    return {"status": "ok"}


@router.get("/playlists/{playlist_id}/share")
async def get_share_state(
    playlist_id: int,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_user_db),
):
    """Return the current share state for a playlist."""
    playlist = get_playlist(current_user["id"], playlist_id, db)
    if not playlist:
        raise HTTPException(status_code=404, detail="片单不存在")
    return {"shared": bool(playlist.share_token), "share_token": playlist.share_token}


# ── Items ──────────────────────────────────────────────────────────


@router.post("/playlists/{playlist_id}/items")
async def add_item_endpoint(
    playlist_id: int,
    request: PlaylistItemInput,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_user_db),
):
    """Add an item to a playlist.

    Provide ``media_id`` to reference an existing library item (the
    snapshot is auto-filled), or the snapshot fields directly to add an
    arbitrary movie/TV show. Duplicates (same tmdb_id, or same
    title+year) are silently skipped.
    """
    if request.media_id is None and not (request.title and request.title.strip()):
        raise HTTPException(status_code=400, detail="需要提供 media_id 或标题")
    item, added = add_playlist_item(
        current_user["id"],
        playlist_id,
        db=db,
        media_id=request.media_id,
        title=request.title,
        year=request.year,
        genre=request.genre,
        media_type=request.media_type,
        poster_url=request.poster_url,
        overview=request.overview,
        tmdb_id=request.tmdb_id,
        country=request.country,
        note=request.note,
    )
    if item is None:
        raise HTTPException(status_code=404, detail="片单或媒体条目不存在")
    log_operation(
        current_user["id"], current_user["username"],
        "add_playlist_item",
        f"片单添加条目: {item.title}{' (重复跳过)' if not added else ''}",
        db=db,
    )
    result = _item_to_dict(item)
    result["duplicate"] = not added
    return result


@router.put("/playlists/{playlist_id}/items/reorder")
async def reorder_items_endpoint(
    playlist_id: int,
    request: PlaylistReorderRequest,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_user_db),
):
    """Reorder playlist items by an ordered list of item IDs."""
    if not request.ordered_ids:
        raise HTTPException(status_code=400, detail="请提供有序的条目 ID 列表")
    ok = reorder_playlist_items(
        current_user["id"], playlist_id, request.ordered_ids, db=db,
    )
    if not ok:
        raise HTTPException(status_code=404, detail="片单不存在或 ID 列表不匹配")
    return {"status": "ok", "count": len(request.ordered_ids)}


@router.put("/playlists/{playlist_id}/items/{item_id}")
async def update_item_endpoint(
    playlist_id: int,
    item_id: int,
    request: PlaylistItemUpdate,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_user_db),
):
    """Update a playlist item (note / metadata)."""
    updated = update_playlist_item(
        current_user["id"],
        playlist_id,
        item_id,
        db=db,
        note=request.note,
        title=request.title,
        year=request.year,
        genre=request.genre,
        poster_url=request.poster_url,
    )
    if not updated:
        raise HTTPException(status_code=404, detail="条目不存在")
    return _item_to_dict(updated)


@router.delete("/playlists/{playlist_id}/items/{item_id}")
async def delete_item_endpoint(
    playlist_id: int,
    item_id: int,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_user_db),
):
    """Remove an item from a playlist."""
    ok = delete_playlist_item(current_user["id"], playlist_id, item_id, db=db)
    if not ok:
        raise HTTPException(status_code=404, detail="条目不存在")
    return {"status": "deleted"}


# ── Public share view (no authentication!) ─────────────────────────


@router.get("/share/{token}")
async def get_shared_playlist(token: str):
    """Read-only public view of a shared playlist.

    The token embeds the owner's user id as a prefix (``{user_id}.{rand}``)
    so we can resolve the correct per-user database without scanning all
    of them. Only non-sensitive snapshot metadata is returned — no media_id
    references, no ratings, no user data.
    """
    if not token or "." not in token:
        raise HTTPException(status_code=404, detail="分享链接无效或已失效")

    user_id_part = token.split(".", 1)[0]
    try:
        user_id = int(user_id_part)
    except ValueError:
        raise HTTPException(status_code=404, detail="分享链接无效或已失效")

    from database import get_user_engine

    # Guard against arbitrary user-id prefixes: opening an engine for a
    # nonexistent user lazily creates an empty DB file, which would make
    # the query below raise "no such table: playlists". Any DB-level error
    # here simply means the token is invalid / expired → 404.
    try:
        db = Session(get_user_engine(user_id))
    except Exception:
        raise HTTPException(status_code=404, detail="分享链接无效或已失效")

    try:
        playlist = get_playlist_by_token(token, user_id, db)
        if not playlist:
            raise HTTPException(status_code=404, detail="分享链接无效或已失效")

        items = list_items(playlist.id, db)
        return {
            "name": playlist.name,
            "description": playlist.description,
            "cover_url": playlist.cover_url,
            "created_at": iso_utc(playlist.created_at),
            "item_count": len(items),
            "items": [_public_item_to_dict(i) for i in items],
        }
    except HTTPException:
        raise
    except Exception:
        # Table missing (old DB before migration), user removed, etc.
        raise HTTPException(status_code=404, detail="分享链接无效或已失效")
    finally:
        db.close()
