"""Movie search service — proxies requests to TMDB and TVmaze APIs."""

import logging
import re
from typing import Optional

from config_manager import get_api_key as get_config_api_key
from httpx import Timeout
from http_client import get_shared_client
from scraper.match import strip_season, extract_season_number, title_similarity

logger = logging.getLogger(__name__)


TMDB_BASE = "https://api.tmdb.org/3"
TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p/w342"
TVMAZE_BASE = "https://api.tvmaze.com"

# Match an exact year token (standalone, not part of a word like "2001:")
_YEAR_PATTERN = re.compile(r"^(19[0-9]{2}|20[0-9]{2})$")


def extract_year(query: str) -> tuple[str, Optional[int]]:
    """Extract a 4-digit year from the search query, if present.

    Only matches when the year is a standalone token (surrounded by
    whitespace or at string boundaries). This ensures titles like
    ``"2001: A Space Odyssey"`` are not incorrectly parsed.

    Returns ``(cleaned_query, year)`` where ``cleaned_query`` has the
    year token removed. If no year is found, returns ``(original_query, None)``.

    Examples:
        ``extract_year("Inception 2010") → ("Inception", 2010)``
        ``extract_year("The Dark Knight") → ("The Dark Knight", None)``
        ``extract_year("2001: A Space Odyssey") → ("2001: A Space Odyssey", None)``
        ``extract_year("Room 2015") → ("Room", 2015)``
    """
    tokens = query.split()
    year = None
    cleaned_tokens = []
    for token in tokens:
        if _YEAR_PATTERN.match(token) and year is None:
            year = int(token)
        else:
            cleaned_tokens.append(token)
    return " ".join(cleaned_tokens) or query, year


class MovieSearchResult:
    """Normalized search result from external search sources."""
    def __init__(
        self,
        title: str,
        year: Optional[int],
        genre: str,
        poster_url: Optional[str],
        source_id: str,
        source: str,
        original_title: Optional[str] = None,
        media_type: str = "movie",
        tv_series_id: Optional[str] = None,
        season_number: Optional[int] = None,
        season_poster_url: Optional[str] = None,
        episode_count: Optional[int] = None,
        series_poster_url: Optional[str] = None,
    ):
        self.title = title
        self.year = year
        self.genre = genre
        self.poster_url = poster_url
        self.source_id = source_id
        self.source = source
        self.original_title = original_title
        self.media_type = media_type
        self.tv_series_id = tv_series_id
        self.season_number = season_number
        self.season_poster_url = season_poster_url
        self.episode_count = episode_count
        self.series_poster_url = series_poster_url

    def to_dict(self) -> dict:
        d = {
            "title": self.title,
            "year": self.year,
            "genre": self.genre,
            "poster_url": self.poster_url,
            "source_id": self.source_id,
            "source": self.source,
            "media_type": self.media_type,
        }
        if self.original_title:
            d["original_title"] = self.original_title
        if self.tv_series_id:
            d["tv_series_id"] = self.tv_series_id
        if self.season_number is not None:
            d["season_number"] = self.season_number
        if self.season_poster_url:
            d["season_poster_url"] = self.season_poster_url
        if self.episode_count is not None:
            d["episode_count"] = self.episode_count
        if self.series_poster_url:
            d["series_poster_url"] = self.series_poster_url
        return d


def search_tmdb(query: str, api_key: str, language: str = "zh-CN", year: Optional[int] = None) -> list[MovieSearchResult]:
    """Search movies via TMDB API with a single language.

    If ``year`` is provided, passes ``&year=YYYY`` to TMDB so results
    are filtered to that specific release year.
    """
    url = f"{TMDB_BASE}/search/movie"
    params = {"api_key": api_key, "query": query, "language": language}
    if year is not None:
        params["year"] = year
    try:
        client = get_shared_client()
        resp = client.get(url, params=params, timeout=Timeout(5.0, connect=15.0))
        resp.raise_for_status()
        data = resp.json()
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


def search_tvmaze(query: str) -> list[MovieSearchResult]:
    url = f"{TVMAZE_BASE}/search/shows"
    params = {"q": query}
    try:
        client = get_shared_client()
        resp = client.get(url, params=params, timeout=Timeout(5.0, connect=15.0))
        resp.raise_for_status()
        data = resp.json()
    except Exception as e:
        raise RuntimeError(f"TVmaze search failed: {e}")

    results: list[MovieSearchResult] = []
    for item in data:
        show = item.get("show", {})
        name = show.get("name") or ""
        if not name:
            continue
        premiered = show.get("premiered", "")
        year = int(premiered[:4]) if premiered and len(premiered) >= 4 else None
        genres = show.get("genres", [])
        genre_str = " / ".join(genres) if genres else ""
        image = show.get("image") or {}
        poster_url = image.get("medium") or None
        # Strip HTML tags from summary for a clean preview
        summary = show.get("summary", "") or ""
        if summary:
            summary = _strip_html(summary)

        results.append(MovieSearchResult(
            title=name,
            year=year,
            genre=genre_str,
            poster_url=poster_url,
            source_id=str(show.get("id", "")),
            source="tvmaze",
            original_title=show.get("name", ""),
            media_type="tv",
        ))
    return results


def _strip_html(text: str) -> str:
    """Remove HTML tags from a string and strip whitespace."""
    return re.sub(r"<[^>]+>", "", text).strip()


def search_movies(query: str, source: str = "tmdb", dual_language: bool = False, media_type: str | None = None) -> list[dict]:
    """Search movies/TV via external sources.

    Args:
        query: Search query string. May include a year (e.g. ``"Inception 2010"``)
            which will be extracted and passed as a filter to the API.
        source: ``"tmdb"``, ``"tvmaze"``, or ``"auto"``.
        dual_language: If True, search in both zh-CN and en-US and merge.
        media_type: When set to ``"movie"`` or ``"tv"``, only search that
            specific endpoint (saves API calls). ``None`` searches both.
    """
    original_query = query.strip()
    if not original_query:
        return []

    # Parse season number BEFORE stripping (e.g., "黑袍纠察队 第四季" → 4)
    season_number = extract_season_number(original_query)

    # Strip season info for clean search
    query = strip_season(original_query)
    if not query:
        return []

    # Extract year from query (e.g. "Inception 2010" → year=2010, query="Inception")
    query, search_year = extract_year(query)
    if not query:
        return []

    search_queries = [query]
    if " / " in query:
        for part in query.split(" / "):
            part = part.strip()
            if part and part not in search_queries:
                search_queries.append(part)

    tmdb_key = get_config_api_key("tmdb")
    # Helpful error when no keys are configured
    if source not in ("tvmaze", "auto") and not tmdb_key:
        raise RuntimeError(
            "未配置电影数据库 API Key，请在设置页面中配置 TMDB API Key\n"
            "TMDB: https://www.themoviedb.org/settings/api\n"
        )
    if source == "tmdb" and not tmdb_key:
        raise RuntimeError("TMDB 搜索需要设置 TMDB_API_KEY，请在设置页面中配置")

    results: list[MovieSearchResult] = []

    if source == "tmdb" and tmdb_key:
        _search_tmdb_variants(search_queries, tmdb_key, dual_language, results, media_type=media_type, year=search_year)
    elif source == "tvmaze":
        _search_tvmaze_variants(search_queries, results)
    elif source == "auto":
        _search_auto(search_queries, tmdb_key, results, year=search_year)

    # Final deduplicate by title
    seen: set[str] = set()
    deduped: list[MovieSearchResult] = []
    for r in results:
        key = r.title.lower().strip()
        if key not in seen:
            seen.add(key)
            deduped.append(r)

    # If season_number is known, enrich TV results with season-specific data
    if season_number is not None and tmdb_key:
        _enrich_tv_with_season_data(deduped, season_number, tmdb_key)

    # Re-rank by title similarity: put better title matches first,
    # regardless of TMDB's popularity-based ordering. This ensures
    # that searching "麻将" ranks the exact match "麻将" above
    # "麻将之夜" (which only contains the query as a substring).
    _rank_by_title_similarity(deduped, original_query)

    return [r.to_dict() for r in deduped]


def _enrich_tv_with_season_data(results: list[MovieSearchResult], season_number: int, tmdb_key: str):
    enriched = 0
    for r in results:
        if enriched >= 2:
            break
        if r.source == "tmdb" and r.media_type == "tv" and r.source_id:
            # Always set season_number so the frontend shows the badge
            r.season_number = season_number
            try:
                season_data = _get_tmdb_tv_season_detail(r.source_id, season_number, tmdb_key)
                if season_data.get("season_poster_url"):
                    # Save the original series poster before overwriting
                    r.series_poster_url = r.poster_url
                    r.season_poster_url = season_data["season_poster_url"]
                    r.poster_url = season_data["season_poster_url"]
                r.episode_count = season_data.get("season_episode_count")
                enriched += 1
            except RuntimeError:
                pass


def _merge_results(new_results: list[MovieSearchResult], target: list[MovieSearchResult]):
    """Merge new_results into target, deduplicating by lowercased title."""
    seen = set(r.title.lower().strip() for r in target)
    for r in new_results:
        key = r.title.lower().strip()
        if key not in seen:
            seen.add(key)
            target.append(r)


def _rank_by_title_similarity(results: list[MovieSearchResult], query: str):
    """Re-rank search results in-place by title similarity to the query.

    TMDB returns results sorted by **popularity**, which means a popular
    but loosely-related title (e.g. ``"麻将之夜"``) can rank above a less
    popular but exact match (e.g. ``"麻将"``). This function re-orders
    results so the most **title-relevant** matches appear first.

    Uses the same :func:`title_similarity` scoring as the metadata scraper
    for consistent matching behavior across search and enrichment.
    """

    def _score(result: MovieSearchResult) -> float:
        candidates = [result.title]
        if result.original_title and result.original_title != result.title:
            candidates.append(result.original_title)
        return max(title_similarity(query, c) for c in candidates)

    results.sort(key=_score, reverse=True)


def _search_tmdb_variants(
    search_queries: list[str],
    tmdb_key: str,
    dual_language: bool,
    results: list[MovieSearchResult],
    media_type: str | None = None,
    year: Optional[int] = None,
):
    """Search TMDB movies + TV, trying each query variant.

    When ``media_type`` is ``"movie"`` or ``"tv"``, only searches the
    corresponding endpoint — saving a wasteful API call.
    When ``None`` (default), searches both movie and TV endpoints.

    If ``year`` is provided, passes it as a filter to TMDB (``&year=YYYY``
    for movies, ``&first_air_date_year=YYYY`` for TV).

    Stops trying new variants once we have results.
    """
    for q in search_queries:
        q_results: list[MovieSearchResult] = []
        seen_titles: set[str] = set()

        # Movie search (skip when media_type="tv")
        if media_type != "tv":
            try:
                if dual_language:
                    movie_results = search_tmdb_dual(q, tmdb_key, year=year)
                else:
                    movie_results = search_tmdb(q, tmdb_key, year=year)
                for r in movie_results:
                    seen_titles.add(r.title.lower().strip())
                    q_results.append(r)
            except RuntimeError as e:
                logger.warning("TMDB movie search failed for '%s': %s", q, e)

        # TV search (skip when media_type="movie")
        if media_type != "movie":
            try:
                if dual_language:
                    tv_results = search_tmdb_tv_dual(q, tmdb_key, year=year)
                else:
                    tv_results = search_tmdb_tv(q, tmdb_key, year=year)
                for r in tv_results:
                    key = r.title.lower().strip()
                    if key not in seen_titles:
                        seen_titles.add(key)
                        q_results.append(r)
            except RuntimeError as e:
                logger.warning("TMDB TV search failed for '%s': %s", q, e)

        _merge_results(q_results, results)
        # Stop trying more variants if we already have results
        if results:
            break

def _search_tvmaze_variants(
    search_queries: list[str],
    results: list[MovieSearchResult],
):
    """Search TVmaze, trying each query variant and merging all results."""
    for q in search_queries:
        try:
            q_results = search_tvmaze(q)
            _merge_results(q_results, results)
        except RuntimeError:
            pass


def _search_auto(
    search_queries: list[str],
    tmdb_key: Optional[str],
    results: list[MovieSearchResult],
    year: Optional[int] = None,
):
    """Auto mode: TMDB first (variants until results), then TVmaze append."""
    # Step 1: TMDB — try each variant until we get results
    if tmdb_key:
        try:
            _search_tmdb_variants(search_queries, tmdb_key, dual_language=False, results=results, year=year)
        except RuntimeError:
            pass

    # Step 2: TVmaze — always try all variants (TV-specific coverage, dedup by title)
    _search_tvmaze_variants(search_queries, results)


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


# ============================================
# TV detail fetch
# ============================================


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


# ============================================
# TVmaze detail
# ============================================


def _get_tvmaze_detail(show_id: str, season_number: Optional[int] = None) -> dict:
    """Fetch full TV series details from TVmaze by show ID.

    TVmaze is free and requires no API key. The response includes
    rich metadata: name, status, network, genres, summary, image,
    external IDs (IMDb, TheTVDB), and more.

    Uses ``?embed=episodes`` to get the episode list, which is
    counted to populate ``season_episode_count``.

    If ``season_number`` is provided, only episodes from that
    season are counted — so the episode count accurately reflects
    a specific season's number of episodes rather than the total
    series episode count.
    """
    url = f"{TVMAZE_BASE}/shows/{show_id}"
    params = {"embed": "episodes"}
    try:
        client = get_shared_client()
        resp = client.get(url, params=params, timeout=Timeout(5.0, connect=15.0))
        resp.raise_for_status()
        data = resp.json()
    except Exception as e:
        raise RuntimeError(f"TVmaze detail fetch failed: {e}")

    premiered = data.get("premiered", "")
    year = int(premiered[:4]) if premiered and len(premiered) >= 4 else None
    image = data.get("image") or {}
    poster_url = image.get("original") or image.get("medium") or None
    genres = data.get("genres", [])
    genre_str = " / ".join(genres) if genres else ""
    summary = data.get("summary", "") or ""
    if summary:
        summary = _strip_html(summary)
    network = data.get("network") or {}
    network_name = network.get("name", "") if network else ""
    web_channel = data.get("webChannel") or {}
    web_channel_name = web_channel.get("name", "") if web_channel else ""
    channel = network_name or web_channel_name
    externals = data.get("externals", {}) or {}
    imdb_id = externals.get("imdb", "") or ""
    thetvdb_id = externals.get("thetvdb", "") or ""

    # Build a runtime-like field: average episode runtime
    avg_runtime = data.get("averageRuntime") or data.get("runtime") or None

    # ── Episode count: filter by season if season_number is known ──
    embedded = data.get("_embedded") or {}
    episodes_list = embedded.get("episodes") or []
    if season_number is not None:
        # TVmaze episodes have a ``season`` field — filter to match
        season_episodes = [
            ep for ep in episodes_list
            if ep.get("season") == season_number
        ]
        episode_count = len(season_episodes) if season_episodes else None
    else:
        episode_count = len(episodes_list) if episodes_list else None

    # TVmaze has no native tv_series_id; use the same show_id so that
    # all seasons of the same show share a common grouping key.
    tv_series_id = show_id

    result = {
        "title": data.get("name", ""),
        "year": year,
        "genre": genre_str,
        "poster_url": poster_url,
        "overview": summary,
        "rating": data.get("rating", {}).get("average") if data.get("rating") else None,
        "vote_count": None,
        "runtime": avg_runtime,
        "tagline": "",
        "homepage": data.get("url", ""),
        "original_language": data.get("language", ""),
        "source": "tvmaze",
        "source_id": show_id,
        "tv_series_id": tv_series_id,
        "media_type": "tv",
        "writer": "",
        "country": network.get("country", {}).get("name", "") if network else "",
        "status": data.get("status", ""),
        "network": channel,
        "imdb_id": imdb_id if imdb_id.startswith("tt") else None,
        "thetvdb_id": str(thetvdb_id) if thetvdb_id else None,
        "season_episode_count": episode_count,
        "seasons": None,
        "episodes": None,
    }

    # Also set season_number in the result so enrich_media_metadata can
    # save it to the database — consistent with TMDB TV path.
    if season_number is not None:
        result["season_number"] = season_number

    return result


# ============================================
# ISO alpha-2 → country name (for origin_country)
# ============================================

_ISO2_TO_COUNTRY: dict[str, str] = {
    "US": "United States",
    "CA": "Canada",
    "GB": "United Kingdom",
    "CN": "China",
    "JP": "Japan",
    "KR": "South Korea",
    "FR": "France",
    "DE": "Germany",
    "IN": "India",
    "AU": "Australia",
    "BR": "Brazil",
    "IT": "Italy",
    "ES": "Spain",
    "RU": "Russia",
    "SE": "Sweden",
    "DK": "Denmark",
    "NO": "Norway",
    "NL": "Netherlands",
    "BE": "Belgium",
    "CH": "Switzerland",
    "AT": "Austria",
    "PL": "Poland",
    "TR": "Turkey",
    "MX": "Mexico",
    "AR": "Argentina",
    "CO": "Colombia",
    "CL": "Chile",
    "TH": "Thailand",
    "TW": "Taiwan",
    "HK": "Hong Kong",
    "SG": "Singapore",
    "NZ": "New Zealand",
    "ZA": "South Africa",
    "IL": "Israel",
    "IE": "Ireland",
    "PT": "Portugal",
    "GR": "Greece",
    "CZ": "Czech Republic",
    "HU": "Hungary",
    "RO": "Romania",
    "UA": "Ukraine",
    "FI": "Finland",
    "IS": "Iceland",
    "PH": "Philippines",
    "ID": "Indonesia",
    "MY": "Malaysia",
    "VN": "Vietnam",
    "EG": "Egypt",
    "NG": "Nigeria",
    "KE": "Kenya",
    "MA": "Morocco",
    "IR": "Iran",
    "SA": "Saudi Arabia",
    "AE": "United Arab Emirates",
    "PK": "Pakistan",
    "BD": "Bangladesh",
    "PE": "Peru",
    "VE": "Venezuela",
    "CU": "Cuba",
    "HR": "Croatia",
    "RS": "Serbia",
    "BG": "Bulgaria",
    "SK": "Slovakia",
    "SI": "Slovenia",
    "LT": "Lithuania",
    "LV": "Latvia",
    "EE": "Estonia",
    "LU": "Luxembourg",
    "GE": "Georgia",
    "LB": "Lebanon",
    "JO": "Jordan",
    "QA": "Qatar",
    "PR": "Puerto Rico",
    "CR": "Costa Rica",
    "PA": "Panama",
    "UY": "Uruguay",
    "MM": "Myanmar",
    "KH": "Cambodia",
    "NP": "Nepal",
    "LK": "Sri Lanka",
    "MN": "Mongolia",
    "KZ": "Kazakhstan",
    "DZ": "Algeria",
    "TN": "Tunisia",
    "ET": "Ethiopia",
    "GH": "Ghana",
    "TZ": "Tanzania",
}

# ============================================
# Genre ID mapping
# ============================================

_TMDB_GENRE_MAP: dict[int, str] = {
    28: "Action",
    12: "Adventure",
    16: "Animation",
    35: "Comedy",
    80: "Crime",
    99: "Documentary",
    18: "Drama",
    10751: "Family",
    14: "Fantasy",
    36: "History",
    27: "Horror",
    10402: "Music",
    9648: "Mystery",
    10749: "Romance",
    878: "Sci-Fi",
    10770: "TV Movie",
    53: "Thriller",
    10752: "War",
    37: "Western",
}

_TMDB_TV_GENRE_MAP: dict[int, str] = {
    10759: "Action & Adventure",
    16: "Animation",
    35: "Comedy",
    80: "Crime",
    99: "Documentary",
    18: "Drama",
    10751: "Family",
    10762: "Kids",
    9648: "Mystery",
    10763: "News",
    10764: "Reality",
    10765: "Sci-Fi & Fantasy",
    10766: "Soap",
    10767: "Talk",
    10768: "War & Politics",
    37: "Western",
}


def _map_tmdb_genres(genre_ids: list[int]) -> str:
    """Map TMDB genre IDs to human-readable genre names."""
    names = []
    for gid in genre_ids:
        name = _TMDB_GENRE_MAP.get(gid)
        if name:
            names.append(name)
    return " / ".join(names) if names else ""


def _map_tmdb_tv_genres(genre_ids: list[int]) -> str:
    """Map TMDB TV genre IDs to human-readable genre names."""
    names = []
    for gid in genre_ids:
        name = _TMDB_TV_GENRE_MAP.get(gid)
        if name:
            names.append(name)
    return " / ".join(names) if names else ""
