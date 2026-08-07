"""TMDB discovery feeds — trending / now playing / upcoming / popular / top rated.

All functions return ``list[dict]`` in the same normalized shape as
``movie_search.search_movies()`` so the frontend can reuse the exact
result-card rendering and detail modal used by search.
"""

import logging
from typing import Optional

from httpx import Timeout
from http_client import get_shared_client

from .constants import TMDB_BASE, TMDB_IMAGE_BASE, _ISO2_TO_COUNTRY
from .genres import _map_tmdb_genres, _map_tmdb_tv_genres

logger = logging.getLogger(__name__)


def _fetch_tmdb_feed(
    path: str,
    api_key: str,
    language: str = "zh-CN",
    page: int = 1,
) -> list[dict]:
    """Generic TMDB feed fetcher (trending/now_playing/upcoming/popular/top_rated).

    All of these endpoints return the same paginated shape
    (``{ "results": [...], "page": n, "total_pages": n }``) with either
    movie or TV fields, so they share one parser. ``media_type`` is
    detected per-item from ``item.get("media_type")`` (present in the
    trending feed), falling back to the presence of a ``name`` field for
    movie/TV-specific endpoints.
    """
    params = {"api_key": api_key, "language": language, "page": page}

    def _do_request() -> dict:
        client = get_shared_client()
        resp = client.get(f"{TMDB_BASE}{path}", params=params, timeout=Timeout(5.0, connect=15.0))
        resp.raise_for_status()
        return resp.json()

    try:
        data = _do_request()
    except Exception:
        # Retry once for transient SSL/network failures
        logger.debug("TMDB feed retrying for %s (page %d)", path, page)
        try:
            data = _do_request()
        except Exception as e:
            raise RuntimeError(f"TMDB feed failed ({path}): {e}")

    results: list[dict] = []
    for item in data.get("results", []):
        is_tv = item.get("media_type") == "tv" or bool(item.get("name") and not item.get("title"))
        title = item.get("title") or item.get("name") or ""
        if not title:
            continue
        release = item.get("release_date", "") or item.get("first_air_date", "")
        year = int(release[:4]) if release and len(release) >= 4 else None
        poster = item.get("poster_path")
        poster_url = f"{TMDB_IMAGE_BASE}{poster}" if poster else None
        genre_ids = item.get("genre_ids", [])
        genre_names = _map_tmdb_tv_genres(genre_ids) if is_tv else _map_tmdb_genres(genre_ids)
        original = item.get("original_title") or item.get("original_name") or ""
        country = ""
        origin = item.get("origin_country") or []
        if origin:
            iso = origin[0]
            country = _ISO2_TO_COUNTRY.get(iso, iso)

        results.append({
            "title": title,
            "year": year,
            "genre": genre_names,
            "poster_url": poster_url,
            "source_id": str(item.get("id", "")),
            "source": "tmdb",
            "media_type": "tv" if is_tv else "movie",
            "tv_series_id": str(item.get("id", "")) if is_tv else None,
            "vote_average": item.get("vote_average"),
            "vote_count": item.get("vote_count"),
            "overview": item.get("overview") or "",
            "country": country or None,
        })

    return results


def get_tmdb_trending(
    api_key: str,
    media_type: str = "all",
    time_window: str = "week",
    language: str = "zh-CN",
    page: int = 1,
) -> list[dict]:
    """Fetch TMDB trending — ``GET /trending/{media_type}/{time_window}``.

    ``media_type`` ∈ {all, movie, tv}; ``time_window`` ∈ {day, week}.
    """
    if media_type not in ("all", "movie", "tv"):
        media_type = "all"
    if time_window not in ("day", "week"):
        time_window = "week"
    return _fetch_tmdb_feed(
        f"/trending/{media_type}/{time_window}", api_key, language, page,
    )


def get_tmdb_now_playing(api_key: str, language: str = "zh-CN", page: int = 1) -> list[dict]:
    """Fetch movies currently in theaters — ``GET /movie/now_playing``."""
    return _fetch_tmdb_feed("/movie/now_playing", api_key, language, page)


def get_tmdb_upcoming(api_key: str, language: str = "zh-CN", page: int = 1) -> list[dict]:
    """Fetch movies releasing soon — ``GET /movie/upcoming``."""
    return _fetch_tmdb_feed("/movie/upcoming", api_key, language, page)


def get_tmdb_popular(
    api_key: str,
    media_type: str = "movie",
    language: str = "zh-CN",
    page: int = 1,
) -> list[dict]:
    """Fetch popular movies or TV shows — ``GET /{media_type}/popular``."""
    if media_type not in ("movie", "tv"):
        media_type = "movie"
    return _fetch_tmdb_feed(f"/{media_type}/popular", api_key, language, page)


def get_tmdb_top_rated(
    api_key: str,
    media_type: str = "movie",
    language: str = "zh-CN",
    page: int = 1,
) -> list[dict]:
    """Fetch top-rated movies or TV shows — ``GET /{media_type}/top_rated``."""
    if media_type not in ("movie", "tv"):
        media_type = "movie"
    return _fetch_tmdb_feed(f"/{media_type}/top_rated", api_key, language, page)


# ── Section registry ────────────────────────────────────────────────
# Maps the ``section`` query param to a fetcher so the router stays small.

_SECTIONS: dict[str, callable] = {
    "trending": lambda k, lang, page, media_type="all", window="week", **_: get_tmdb_trending(k, media_type, window, lang, page),
    "now_playing": lambda k, lang, page, media_type="movie", **_: get_tmdb_now_playing(k, lang, page),
    "upcoming": lambda k, lang, page, media_type="movie", **_: get_tmdb_upcoming(k, lang, page),
    "popular": lambda k, lang, page, media_type="movie", **_: get_tmdb_popular(k, media_type, lang, page),
    "top_rated": lambda k, lang, page, media_type="movie", **_: get_tmdb_top_rated(k, media_type, lang, page),
}


def get_discover(
    api_key: str,
    section: str,
    media_type: str = "all",
    time_window: str = "week",
    language: str = "zh-CN",
    page: int = 1,
) -> list[dict]:
    """Dispatch to the requested discover section."""
    fn = _SECTIONS.get(section)
    if fn is None:
        raise ValueError(f"Unsupported discover section: {section}")
    return fn(api_key, language, page, media_type=media_type, window=time_window)
