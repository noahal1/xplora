"""Aggregated movie/TV search across TMDB and TVmaze."""

import logging
from typing import Optional

from config_manager import get_api_key as get_config_api_key
from scraper.match import extract_season_number, strip_season, title_similarity

from .constants import _YEAR_PATTERN
from .models import MovieSearchResult
from .tmdb import (
    _get_tmdb_tv_season_detail,
    search_tmdb,
    search_tmdb_dual,
    search_tmdb_tv,
    search_tmdb_tv_dual,
)
from .tvmaze import search_tvmaze

logger = logging.getLogger(__name__)

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


