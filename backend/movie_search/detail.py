"""Fetch full media details from TMDB or TVmaze by source ID."""

from typing import Optional

from config_manager import get_api_key as get_config_api_key

from .tmdb import _get_tmdb_detail, _get_tmdb_tv_detail
from .tvmaze import _get_tvmaze_detail

def get_movie_detail(source: str, source_id: str, media_type: str = "movie", season_number: Optional[int] = None) -> dict:
    """Fetch full details from the specified source by ID.

    Args:
        source: ``"tmdb"`` or ``"tvmaze"``.
        source_id: The ID in the source system.
        media_type: ``"movie"`` or ``"tv"`` (only used for TMDB).
        season_number: If set and source is TMDB TV, also fetch
            season-specific metadata from ``/tv/{id}/season/{n}``.
            If set and source is TVmaze, filter embedded episodes
            to count only episodes from that season.
    """
    tmdb_key = get_config_api_key("tmdb")

    if source == "tmdb":
        if not tmdb_key:
            raise RuntimeError("TMDB API Key 未配置，请在设置页面中配置")
        if media_type == "tv":
            return _get_tmdb_tv_detail(source_id, tmdb_key, season_number=season_number)
        return _get_tmdb_detail(source_id, tmdb_key)
    elif source == "tvmaze":
        return _get_tvmaze_detail(source_id, season_number=season_number)
    else:
        raise RuntimeError(f"Unknown source: {source}")


