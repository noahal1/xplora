"""TMDB search, detail, and similar/recommendations API calls."""

import logging
from typing import Optional

from httpx import Timeout
from http_client import get_shared_client

from .constants import TMDB_BASE, TMDB_IMAGE_BASE, _ISO2_TO_COUNTRY
from .genres import _map_tmdb_genres, _map_tmdb_tv_genres
from .models import MovieSearchResult

logger = logging.getLogger(__name__)

def search_tmdb(query: str, api_key: str, language: str = "zh-CN", year: Optional[int] = None) -> list[MovieSearchResult]:
    """Search movies via TMDB API with a single language.

    If ``year`` is provided, passes ``&year=YYYY`` to TMDB so results
    are filtered to that specific release year.

    Retries once on SSL/connection errors to handle transient
    TLS handshake issues (same pattern as ``search_tmdb_tv``).
    """
    url = f"{TMDB_BASE}/search/movie"
    params = {"api_key": api_key, "query": query, "language": language}
    if year is not None:
        params["year"] = year

    def _do_request() -> dict:
        client = get_shared_client()
        resp = client.get(url, params=params, timeout=Timeout(5.0, connect=15.0))
        resp.raise_for_status()
        return resp.json()

    try:
        data = _do_request()
    except Exception:
        # Retry once for transient SSL/network failures
        logger.debug("TMDB movie search retrying for '%s' (%s)", query, language)
        try:
            data = _do_request()
        except Exception as e:
            raise RuntimeError(f"TMDB search failed: {e}")

    results: list[MovieSearchResult] = []
    for item in data.get("results", []):
        title = item.get("title") or ""
        if not title:
            continue
        release = item.get("release_date", "")
        year = int(release[:4]) if release and len(release) >= 4 else None
        poster = item.get("poster_path")
        poster_url = f"{TMDB_IMAGE_BASE}{poster}" if poster else None
        # Map genre_ids to genre names (basic mapping)
        genre_names = _map_tmdb_genres(item.get("genre_ids", []))
        original_title = item.get("original_title") or ""
        results.append(MovieSearchResult(
            title=title,
            year=year,
            genre=genre_names,
            poster_url=poster_url,
            source_id=str(item.get("id", "")),
            source="tmdb",
            original_title=original_title,
        ))
    return results


def search_tmdb_dual(query: str, api_key: str, year: Optional[int] = None) -> list[MovieSearchResult]:
    """Search TMDB in both Chinese and English, then merge results.

    This improves match rates when scraping metadata because the same
    movie may be found under different localized titles. Results are
    deduplicated by TMDB ``source_id``, preferring the Chinese
    localized title when both languages return the same movie.

    If one language's API call fails (network blip, timeout), the
    other language's results are still returned.
    """
    # Search in both languages; each is isolated so a failure in one
    # language doesn't lose the other's results.
    zh_results: list[MovieSearchResult] = []
    en_results: list[MovieSearchResult] = []

    try:
        zh_results = search_tmdb(query, api_key, language="zh-CN", year=year)
    except RuntimeError as e:
        logger.warning("zh-CN TMDB search failed for '%s': %s", query, e)

    try:
        en_results = search_tmdb(query, api_key, language="en-US", year=year)
    except RuntimeError as e:
        logger.warning("en-US TMDB search failed for '%s': %s", query, e)

    # Merge: prefer zh-CN, but add en-US results for movies not
    # found in Chinese search (deduplicate by source_id)
    seen_ids: set[str] = set()
    merged: list[MovieSearchResult] = []

    for r in zh_results:
        seen_ids.add(r.source_id)
        merged.append(r)

    for r in en_results:
        if r.source_id not in seen_ids:
            seen_ids.add(r.source_id)
            merged.append(r)

    return merged


def search_tmdb_tv(query: str, api_key: str, language: str = "zh-CN", year: Optional[int] = None) -> list[MovieSearchResult]:
    """Search TV series via TMDB API with a single language.

    If ``year`` is provided, passes ``&first_air_date_year=YYYY`` to TMDB
    so results are filtered to shows that began airing in that year.

    Retries once on SSL/connection errors to handle transient
    TLS handshake issues (common on some Windows configurations).
    """
    url = f"{TMDB_BASE}/search/tv"
    params = {"api_key": api_key, "query": query, "language": language}
    if year is not None:
        params["first_air_date_year"] = year

    def _do_request() -> dict:
        client = get_shared_client()
        resp = client.get(url, params=params, timeout=Timeout(5.0, connect=15.0))
        resp.raise_for_status()
        return resp.json()

    try:
        data = _do_request()
    except Exception:
        # Retry once for transient SSL/network failures
        logger.debug("TMDB TV search retrying for '%s' (%s)", query, language)
        try:
            data = _do_request()
        except Exception as e:
            raise RuntimeError(f"TMDB TV search failed: {e}")

    results: list[MovieSearchResult] = []
    for item in data.get("results", []):
        name = item.get("name") or ""
        if not name:
            continue
        first_air = item.get("first_air_date", "")
        year = int(first_air[:4]) if first_air and len(first_air) >= 4 else None
        poster = item.get("poster_path")
        poster_url = f"{TMDB_IMAGE_BASE}{poster}" if poster else None
        genre_names = _map_tmdb_tv_genres(item.get("genre_ids", []))
        original_name = item.get("original_name") or ""
        results.append(MovieSearchResult(
            title=name,
            year=year,
            genre=genre_names,
            poster_url=poster_url,
            source_id=str(item.get("id", "")),
            source="tmdb",
            original_title=original_name,
            media_type="tv",
            tv_series_id=str(item.get("id", "")),
        ))
    return results


def search_tmdb_tv_dual(query: str, api_key: str, year: Optional[int] = None) -> list[MovieSearchResult]:
    """Search TMDB TV in both Chinese and English, then merge results."""
    zh_results: list[MovieSearchResult] = []
    en_results: list[MovieSearchResult] = []

    try:
        zh_results = search_tmdb_tv(query, api_key, language="zh-CN", year=year)
    except RuntimeError as e:
        logger.warning("zh-CN TMDB TV search failed for '%s': %s", query, e)

    try:
        en_results = search_tmdb_tv(query, api_key, language="en-US", year=year)
    except RuntimeError as e:
        logger.warning("en-US TMDB TV search failed for '%s': %s", query, e)

    seen_ids: set[str] = set()
    merged: list[MovieSearchResult] = []
    for r in zh_results:
        seen_ids.add(r.source_id)
        merged.append(r)
    for r in en_results:
        if r.source_id not in seen_ids:
            seen_ids.add(r.source_id)
            merged.append(r)
    return merged


def _get_tmdb_detail(movie_id: str, api_key: str) -> dict:
    """Fetch full movie details from TMDB by movie ID."""
    url = f"{TMDB_BASE}/movie/{movie_id}"
    params = {"api_key": api_key, "language": "zh-CN"}
    try:
        client = get_shared_client()
        resp = client.get(url, params=params, timeout=Timeout(5.0, connect=15.0))
        resp.raise_for_status()
        data = resp.json()
    except Exception as e:
        raise RuntimeError(f"TMDB detail fetch failed: {e}")

    release = data.get("release_date", "")
    year = int(release[:4]) if release and len(release) >= 4 else None
    poster = data.get("poster_path")
    # Use genre IDs to map to English names instead of TMDB's localized names
    genre_ids = [g["id"] for g in data.get("genres", []) if g.get("id")]
    genres = _map_tmdb_genres(genre_ids)

    # Extract country from production_countries
    production_countries = data.get("production_countries", [])
    country = ""
    if production_countries:
        # Pick the first country name (e.g. "United States of America")
        country = production_countries[0].get("name", "")
    # Use origin_country as fallback (rare for movies but TMDB sometimes uses it)
    if not country:
        origin = data.get("origin_country", [])
        if origin:
            iso = origin[0]
            country = _ISO2_TO_COUNTRY.get(iso, iso)

    return {
        "title": data.get("title", ""),
        "year": year,
        "genre": genres,
        "poster_url": f"{TMDB_IMAGE_BASE}{poster}" if poster else None,
        "overview": data.get("overview", ""),
        "rating": data.get("vote_average"),
        "vote_count": data.get("vote_count"),
        "runtime": data.get("runtime"),
        "tagline": data.get("tagline", ""),
        "homepage": data.get("homepage", ""),
        "original_language": data.get("original_language", ""),
        "source": "tmdb",
        "source_id": movie_id,
        "tmdb_id": movie_id,
        "country": country or None,
    }


def _get_tmdb_tv_season_detail(tv_id: str, season_number: int, api_key: str) -> dict:
    """Fetch season-specific metadata from TMDB.

    ``GET /tv/{tv_id}/season/{season_number}``

    Returns season poster, episode count, air date, and episode list.
    """
    url = f"{TMDB_BASE}/tv/{tv_id}/season/{season_number}"
    params = {"api_key": api_key, "language": "zh-CN"}
    try:
        client = get_shared_client()
        resp = client.get(url, params=params, timeout=Timeout(5.0, connect=15.0))
        resp.raise_for_status()
        data = resp.json()
    except Exception as e:
        raise RuntimeError(f"TMDB TV season detail fetch failed: {e}")

    poster = data.get("poster_path")
    episodes = data.get("episodes", [])

    return {
        "season_poster_url": f"{TMDB_IMAGE_BASE}{poster}" if poster else None,
        "season_episode_count": len(episodes),
        "season_air_date": data.get("air_date", ""),
        "season_number": season_number,
        "episodes": [
            {
                "episode_number": ep.get("episode_number"),
                "name": ep.get("name"),
                "air_date": ep.get("air_date"),
            }
            for ep in episodes[:20]
        ],
    }


def _get_tmdb_tv_detail(tv_id: str, api_key: str, season_number: Optional[int] = None) -> dict:
    """Fetch full TV series details from TMDB by ID.

    If ``season_number`` is provided, also fetches ``/tv/{id}/season/{n}``
    and merges season-specific data (season poster replaces series poster,
    episode count, air date) into the result.
    """
    url = f"{TMDB_BASE}/tv/{tv_id}"
    params = {"api_key": api_key, "language": "zh-CN"}
    try:
        client = get_shared_client()
        resp = client.get(url, params=params, timeout=Timeout(5.0, connect=15.0))
        resp.raise_for_status()
        data = resp.json()
    except Exception as e:
        raise RuntimeError(f"TMDB TV detail fetch failed: {e}")

    first_air = data.get("first_air_date", "")
    year = int(first_air[:4]) if first_air and len(first_air) >= 4 else None
    poster = data.get("poster_path")
    # Use genre IDs to map to English names instead of TMDB's localized names
    genre_ids = [g["id"] for g in data.get("genres", []) if g.get("id")]
    genres = _map_tmdb_tv_genres(genre_ids)
    # Episode runtime: TMDB returns an array of episode runtimes (e.g., [44])
    episode_runtimes = data.get("episode_run_time") or []
    episode_runtime = episode_runtimes[0] if episode_runtimes else None
    # Number of seasons as a proxy for "runtime" for TV series
    seasons = data.get("number_of_seasons", 0)
    episodes = data.get("number_of_episodes", 0)

    # Extract country from origin_country (array of ISO codes, e.g. ["US"])
    origin_country = data.get("origin_country", [])
    country = ""
    if origin_country:
        iso = origin_country[0]
        country = _ISO2_TO_COUNTRY.get(iso, iso)
    # Fallback: production_countries (some TV entries have this instead)
    if not country:
        production_countries = data.get("production_countries", [])
        if production_countries:
            country = production_countries[0].get("name", "")

    result = {
        "title": data.get("name", ""),
        "year": year,
        "genre": genres,
        "poster_url": f"{TMDB_IMAGE_BASE}{poster}" if poster else None,
        "overview": data.get("overview", ""),
        "rating": data.get("vote_average"),
        "vote_count": data.get("vote_count"),
        "runtime": episode_runtime,  # Per-episode average runtime for TV series
        "tagline": data.get("tagline", ""),
        "homepage": data.get("homepage", ""),
        "original_language": data.get("original_language", ""),
        "source": "tmdb",
        "source_id": tv_id,
        "tmdb_id": tv_id,
        "media_type": "tv",
        "tv_series_id": tv_id,
        "series_poster_url": f"{TMDB_IMAGE_BASE}{poster}" if poster else None,
        "country": country or None,
        "seasons": seasons,
        "episodes": episodes,
    }

    # If season_number is known, merge season-specific data
    if season_number is not None:
        try:
            season_data = _get_tmdb_tv_season_detail(tv_id, season_number, api_key)
            # Season poster is more accurate than series poster for a specific season
            if season_data.get("season_poster_url"):
                result["poster_url"] = season_data["season_poster_url"]
            result["season_number"] = season_number
            result["season_episode_count"] = season_data.get("season_episode_count")
            result["season_air_date"] = season_data.get("season_air_date", "")
        except RuntimeError as e:
            logger.warning(
                "TMDB season detail fetch failed for TV ID %s season %s: %s",
                tv_id, season_number, e,
            )
    else:
        # No season specified — save the series' total episode count
        result["season_episode_count"] = episodes or None

    return result


def _fetch_tmdb_similar_or_recs(
    url: str, api_key: str, language: str = "zh-CN"
) -> list[MovieSearchResult]:
    """Generic fetcher for TMDB /similar and /recommendations endpoints.

    Both endpoints return the same format (paginated results with
    id, title, poster_path, genre_ids, release_date, etc.) so they
    share this parser.
    """
    params = {"api_key": api_key, "language": language, "page": 1}
    try:
        client = get_shared_client()
        resp = client.get(url, params=params, timeout=Timeout(5.0, connect=15.0))
        resp.raise_for_status()
        data = resp.json()
    except Exception as e:
        raise RuntimeError(f"TMDB similar/recommendations fetch failed: {e}")

    results: list[MovieSearchResult] = []
    for item in data.get("results", []):
        title = item.get("title") or item.get("name") or ""
        if not title:
            continue
        release = item.get("release_date", "") or item.get("first_air_date", "")
        year = int(release[:4]) if release and len(release) >= 4 else None
        poster = item.get("poster_path")
        poster_url = f"{TMDB_IMAGE_BASE}{poster}" if poster else None
        genre_ids = item.get("genre_ids", [])
        # TV results use a different genre map
        media_type_hint = item.get("media_type", "")
        if media_type_hint == "tv":
            genre_names = _map_tmdb_tv_genres(genre_ids)
        else:
            genre_names = _map_tmdb_genres(genre_ids)
        original = item.get("original_title") or item.get("original_name") or ""
        vote_avg = item.get("vote_average")
        vote_cnt = item.get("vote_count")
        results.append(MovieSearchResult(
            title=title,
            year=year,
            genre=genre_names,
            poster_url=poster_url,
            source_id=str(item.get("id", "")),
            source="tmdb",
            original_title=original,
            media_type="tv" if media_type_hint == "tv" else "movie",
            tv_series_id=str(item.get("id", "")) if media_type_hint == "tv" else None,
            vote_average=vote_avg,
            vote_count=vote_cnt,
        ))
    return results


def get_tmdb_movie_similar(movie_id: str, api_key: str) -> list[MovieSearchResult]:
    """Fetch similar movies from TMDB by movie ID.

    ``GET /movie/{movie_id}/similar``
    Returns movies that TMDB's algorithm considers similar.
    """
    url = f"{TMDB_BASE}/movie/{movie_id}/similar"
    return _fetch_tmdb_similar_or_recs(url, api_key)


def get_tmdb_movie_recommendations(movie_id: str, api_key: str) -> list[MovieSearchResult]:
    """Fetch movie recommendations from TMDB by movie ID.

    ``GET /movie/{movie_id}/recommendations``
    Returns personalized recommendations based on user viewing patterns.
    """
    url = f"{TMDB_BASE}/movie/{movie_id}/recommendations"
    return _fetch_tmdb_similar_or_recs(url, api_key)


def get_tmdb_tv_similar(tv_id: str, api_key: str) -> list[MovieSearchResult]:
    """Fetch similar TV shows from TMDB by TV ID.

    ``GET /tv/{tv_id}/similar``
    """
    url = f"{TMDB_BASE}/tv/{tv_id}/similar"
    return _fetch_tmdb_similar_or_recs(url, api_key)


def get_tmdb_tv_recommendations(tv_id: str, api_key: str) -> list[MovieSearchResult]:
    """Fetch TV show recommendations from TMDB by TV ID.

    ``GET /tv/{tv_id}/recommendations``
    """
    url = f"{TMDB_BASE}/tv/{tv_id}/recommendations"
    return _fetch_tmdb_similar_or_recs(url, api_key)


