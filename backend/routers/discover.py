"""Discover endpoints — TMDB trending / now playing / upcoming / popular / top rated.

Lets users browse what's hot (or coming soon) without an AI key and
one-click add results to their wishlist. Requires only the TMDB API key.
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel import Session

from auth import get_current_user
from config_manager import get_api_key as get_config_api_key
from crud import log_operation
from deps import get_user_db
from movie_search.discover import get_discover

router = APIRouter(prefix="/api/discover", tags=["discover"])


@router.get("")
async def discover(
    section: str = Query("trending", pattern="^(trending|now_playing|upcoming|popular|top_rated)$", description="Discovery feed section"),
    media_type: str = Query("all", pattern="^(all|movie|tv)$", description="Media type filter (all only applies to trending)"),
    window: str = Query("week", pattern="^(day|week)$", description="Trending time window"),
    page: int = Query(1, ge=1, le=20, description="Page number"),
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_user_db),
):
    """Return a TMDB discovery feed for the current user."""
    tmdb_key = get_config_api_key("tmdb")
    if not tmdb_key:
        raise HTTPException(
            status_code=503,
            detail="未配置 TMDB API Key，请在设置页面或 .env 文件中配置后使用发现功能",
        )

    # media_type "all" is only valid for trending — coerce for other sections
    if section != "trending" and media_type == "all":
        media_type = "movie"

    # TV-only media_type is only meaningful for sections that support TV
    if media_type == "tv" and section not in ("trending", "popular", "top_rated"):
        media_type = "movie"

    try:
        results = get_discover(
            tmdb_key,
            section=section,
            media_type=media_type,
            time_window=window,
            page=page,
        )
    except RuntimeError as e:
        raise HTTPException(status_code=502, detail=str(e))

    log_operation(
        current_user["id"], current_user["username"],
        "discover", f"浏览发现页: {section} ({media_type}/{window})",
        db=db,
    )
    return {"section": section, "results": results}
