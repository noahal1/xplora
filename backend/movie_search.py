"""Movie search service — proxies requests to TMDB and OMDb APIs."""

import logging
import re
from typing import Optional

from config_manager import get_api_key as get_config_api_key
from http_client import make_client
from scraper.match import strip_season

logger = logging.getLogger(__name__)


TMDB_BASE = "https://api.themoviedb.org/3"
TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p/w185"
OMDB_BASE = "https://www.omdbapi.com"
TVMAZE_BASE = "https://api.tvmaze.com"


class MovieSearchResult:
    """Normalized search result from either TMDB or OMDb."""
    def __init__(self, title: str, year: Optional[int], genre: str, poster_url: Optional[str], source_id: str, source: str, original_title: Optional[str] = None, media_type: str = "movie"):
        self.title = title
        self.year = year
        self.genre = genre
        self.poster_url = poster_url
        self.source_id = source_id
        self.source = source
        self.original_title = original_title
        self.media_type = media_type

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
        return d


def search_tmdb(query: str, api_key: str, language: str = "zh-CN") -> list[MovieSearchResult]:
    """Search movies via TMDB API with a single language."""
    url = f"{TMDB_BASE}/search/movie"
    params = {"api_key": api_key, "query": query, "language": language}
    try:
        with make_client(timeout=5) as client:
            resp = client.get(url, params=params)
            resp.raise_for_status()
            data = resp.json()
    except Exception as e:
        raise RuntimeError(f"TMDB search failed: {e}")

    results: list[MovieSearchResult] = []
    for item in data.get("results", [])[:10]:
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


def search_tmdb_dual(query: str, api_key: str) -> list[MovieSearchResult]:
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
        zh_results = search_tmdb(query, api_key, language="zh-CN")
    except RuntimeError as e:
        logger.warning("zh-CN TMDB search failed for '%s': %s", query, e)

    try:
        en_results = search_tmdb(query, api_key, language="en-US")
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


def search_tmdb_tv(query: str, api_key: str, language: str = "zh-CN") -> list[MovieSearchResult]:
    """Search TV series via TMDB API with a single language.

    Retries once on SSL/connection errors to handle transient
    TLS handshake issues (common on some Windows configurations).
    """
    url = f"{TMDB_BASE}/search/tv"
    params = {"api_key": api_key, "query": query, "language": language}

    def _do_request() -> dict:
        with make_client(timeout=5) as client:
            resp = client.get(url, params=params)
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
    for item in data.get("results", [])[:10]:
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
        ))
    return results


def search_tmdb_tv_dual(query: str, api_key: str) -> list[MovieSearchResult]:
    """Search TMDB TV in both Chinese and English, then merge results."""
    zh_results: list[MovieSearchResult] = []
    en_results: list[MovieSearchResult] = []

    try:
        zh_results = search_tmdb_tv(query, api_key, language="zh-CN")
    except RuntimeError as e:
        logger.warning("zh-CN TMDB TV search failed for '%s': %s", query, e)

    try:
        en_results = search_tmdb_tv(query, api_key, language="en-US")
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


def search_omdb(query: str, api_key: str, media_type: str = "movie") -> list[MovieSearchResult]:
    """Search via OMDb API.

    Args:
        query: Search query string.
        api_key: OMDb API key.
        media_type: ``"movie"``, ``"series"``, or ``"episode"``.
    """
    url = OMDB_BASE
    params = {"apikey": api_key, "s": query, "type": media_type}
    try:
        with make_client(timeout=5) as client:
            resp = client.get(url, params=params)
            resp.raise_for_status()
            data = resp.json()
    except Exception as e:
        raise RuntimeError(f"OMDb search failed: {e}")

    if data.get("Response") != "True":
        return []

    results: list[MovieSearchResult] = []
    for item in data.get("Search", [])[:10]:
        title = item.get("Title", "")
        if not title:
            continue
        year_str = item.get("Year", "")
        # Handle "1999" or "1999–2005" format
        year = int(year_str[:4]) if year_str and year_str[:4].isdigit() else None
        poster_url = item.get("Poster")
        if poster_url == "N/A":
            poster_url = None
        results.append(MovieSearchResult(
            title=title,
            year=year,
            genre="",
            poster_url=poster_url,
            source_id=item.get("imdbID", ""),
            source="omdb",
        ))
    return results


def search_tvmaze(query: str) -> list[MovieSearchResult]:
    """Search TV series via TVmaze API (free, no API key required).

    TVmaze is a community-maintained TV database with comprehensive
    metadata for television shows worldwide. It uses fuzzy matching
    so even partial/typo queries return relevant results.

    Returns a list of ``MovieSearchResult`` with ``media_type="tv"``.
    """
    url = f"{TVMAZE_BASE}/search/shows"
    params = {"q": query}
    try:
        with make_client(timeout=5) as client:
            resp = client.get(url, params=params)
            resp.raise_for_status()
            data = resp.json()
    except Exception as e:
        raise RuntimeError(f"TVmaze search failed: {e}")

    results: list[MovieSearchResult] = []
    for item in data[:15]:
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


def search_movies(query: str, source: str = "tmdb", dual_language: bool = False) -> list[dict]:
    """Unified search entry point. Returns list of dicts ready for JSON serialization.

    Args:
        query: Search query string.
        source: ``"tmdb"``, ``"omdb"``, ``"tvmaze"``, or ``"auto"``.
        dual_language: If True and source is TMDB, search in both
            Chinese and English then merge results (better for
            background scraping match rates).
    """
    query = query.strip()
    if not query:
        return []

    # Strip season info (e.g., "黑袍纠察队 第四季" → "黑袍纠察队")
    query = strip_season(query)
    if not query:
        return []

    # Build search_queries: try the full query first, then each " / " part
    search_queries = [query]
    if " / " in query:
        for part in query.split(" / "):
            part = part.strip()
            if part and part not in search_queries:
                search_queries.append(part)

    tmdb_key = get_config_api_key("tmdb")
    omdb_key = get_config_api_key("omdb")

    # Helpful error when no keys are configured
    if source not in ("tvmaze", "auto") and not tmdb_key and not omdb_key:
        raise RuntimeError(
            "未配置电影数据库 API Key，请在设置页面中配置 TMDB 或 OMDb API Key\n"
            "TMDB: https://www.themoviedb.org/settings/api\n"
            "OMDb: https://www.omdbapi.com/apikey.aspx"
        )
    if source == "tmdb" and not tmdb_key:
        raise RuntimeError("TMDB 搜索需要设置 TMDB_API_KEY，请在设置页面中配置")
    if source == "omdb" and not omdb_key:
        raise RuntimeError("OMDb 搜索需要设置 OMDB_API_KEY，请在设置页面中配置")

    results: list[MovieSearchResult] = []

    if source == "tmdb" and tmdb_key:
        _search_tmdb_variants(search_queries, tmdb_key, dual_language, results)
    elif source == "omdb" and omdb_key:
        _search_omdb_variants(search_queries, omdb_key, results)
    elif source == "tvmaze":
        _search_tvmaze_variants(search_queries, results)
    elif source == "auto":
        _search_auto(search_queries, tmdb_key, omdb_key, results)

    # Final deduplicate by title
    seen: set[str] = set()
    deduped: list[MovieSearchResult] = []
    for r in results:
        key = r.title.lower().strip()
        if key not in seen:
            seen.add(key)
            deduped.append(r)

    return [r.to_dict() for r in deduped]


def _merge_results(new_results: list[MovieSearchResult], target: list[MovieSearchResult]):
    """Merge new_results into target, deduplicating by lowercased title."""
    seen = set(r.title.lower().strip() for r in target)
    for r in new_results:
        key = r.title.lower().strip()
        if key not in seen:
            seen.add(key)
            target.append(r)


def _search_tmdb_variants(
    search_queries: list[str],
    tmdb_key: str,
    dual_language: bool,
    results: list[MovieSearchResult],
):
    """Search TMDB movies + TV, trying each query variant.
    Stops trying new variants once we have results.
    """
    for q in search_queries:
        movie_results: list[MovieSearchResult] = []
        if dual_language:
            movie_results = search_tmdb_dual(q, tmdb_key)
        else:
            movie_results = search_tmdb(q, tmdb_key)
        tv_results: list[MovieSearchResult] = []
        try:
            if dual_language:
                tv_results = search_tmdb_tv_dual(q, tmdb_key)
            else:
                tv_results = search_tmdb_tv(q, tmdb_key)
        except RuntimeError as e:
            logger.warning("TMDB TV search failed for '%s' (movie results still returned): %s", q, e)
        # Merge q's movie + tv results (dedup by title within this query)
        q_results: list[MovieSearchResult] = []
        seen_titles: set[str] = set()
        for r in movie_results:
            seen_titles.add(r.title.lower().strip())
            q_results.append(r)
        for r in tv_results:
            key = r.title.lower().strip()
            if key not in seen_titles:
                q_results.append(r)
        _merge_results(q_results, results)
        # Stop trying more variants if we already have results
        if results:
            break


def _search_omdb_variants(
    search_queries: list[str],
    omdb_key: str,
    results: list[MovieSearchResult],
):
    """Search OMDb, trying each query variant until we get results."""
    for q in search_queries:
        q_results = search_omdb(q, omdb_key)
        if q_results:
            _merge_results(q_results, results)
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
    omdb_key: Optional[str],
    results: list[MovieSearchResult],
):
    """Auto mode: TMDB first (variants until results), then OMDb fallback, then TVmaze append."""
    # Step 1: TMDB — try each variant until we get results
    if tmdb_key:
        try:
            _search_tmdb_variants(search_queries, tmdb_key, dual_language=False, results=results)
        except RuntimeError:
            pass

    # Step 2: OMDb fallback — only if TMDB gave no results, try first query variant
    if not results and omdb_key:
        try:
            q_results = search_omdb(search_queries[0], omdb_key)
            _merge_results(q_results, results)
        except RuntimeError:
            logger.warning("OMDb fallback search failed for '%s'", search_queries[0])

    # Step 3: TVmaze — always try all variants (TV-specific coverage, dedup by title)
    _search_tvmaze_variants(search_queries, results)


def get_movie_detail(source: str, source_id: str, media_type: str = "movie") -> dict:
    """Fetch full details from the specified source by ID.

    Args:
        source: ``"tmdb"``, ``"omdb"``, or ``"tvmaze"``.
        source_id: The ID in the source system.
        media_type: ``"movie"`` or ``"tv"`` (only used for TMDB).
    """
    tmdb_key = get_config_api_key("tmdb")
    omdb_key = get_config_api_key("omdb")

    if source == "tmdb":
        if not tmdb_key:
            raise RuntimeError("TMDB API Key 未配置，请在设置页面中配置")
        if media_type == "tv":
            return _get_tmdb_tv_detail(source_id, tmdb_key)
        return _get_tmdb_detail(source_id, tmdb_key)
    elif source == "omdb":
        if not omdb_key:
            raise RuntimeError("OMDb API Key 未配置，请在设置页面中配置")
        return _get_omdb_detail(source_id, omdb_key)
    elif source == "tvmaze":
        return _get_tvmaze_detail(source_id)
    else:
        raise RuntimeError(f"Unknown source: {source}")


def _get_tmdb_detail(movie_id: str, api_key: str) -> dict:
    """Fetch full movie details from TMDB by movie ID."""
    url = f"{TMDB_BASE}/movie/{movie_id}"
    params = {"api_key": api_key, "language": "zh-CN"}
    try:
        with make_client(timeout=5) as client:
            resp = client.get(url, params=params)
            resp.raise_for_status()
            data = resp.json()
    except Exception as e:
        raise RuntimeError(f"TMDB detail fetch failed: {e}")

    release = data.get("release_date", "")
    year = int(release[:4]) if release and len(release) >= 4 else None
    poster = data.get("poster_path")
    genres = [g["name"] for g in data.get("genres", []) if g.get("name")]

    return {
        "title": data.get("title", ""),
        "year": year,
        "genre": " / ".join(genres),
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
    }


def _get_omdb_detail(imdb_id: str, api_key: str) -> dict:
    """Fetch full movie details from OMDb by IMDb ID."""
    url = OMDB_BASE
    params = {"apikey": api_key, "i": imdb_id, "plot": "full"}
    try:
        with make_client(timeout=5) as client:
            resp = client.get(url, params=params)
            resp.raise_for_status()
            data = resp.json()
    except Exception as e:
        raise RuntimeError(f"OMDb detail fetch failed: {e}")

    if data.get("Response") != "True":
        raise RuntimeError(f"OMDb: {data.get('Error', 'Unknown error')}")

    year_str = data.get("Year", "")
    year = int(year_str[:4]) if year_str and year_str[:4].isdigit() else None
    poster_url = data.get("Poster")
    if poster_url == "N/A":
        poster_url = None

    # Parse ratings from different sources
    ratings_raw = data.get("Ratings", [])
    ratings = {}
    for r in ratings_raw:
        source_name = r.get("Source", "")
        value = r.get("Value", "")
        if source_name == "Internet Movie Database":
            ratings["imdb"] = value
        elif source_name == "Rotten Tomatoes":
            ratings["rotten_tomatoes"] = value
        elif source_name == "Metacritic":
            ratings["metacritic"] = value

    # Parse runtime to integer minutes
    runtime_str = data.get("Runtime", "")
    runtime = None
    if runtime_str:
        try:
            runtime = int(runtime_str.replace(" min", ""))
        except ValueError:
            pass

    return {
        "title": data.get("Title", ""),
        "year": year,
        "genre": data.get("Genre", ""),
        "poster_url": poster_url,
        "overview": data.get("Plot", ""),
        "rating": data.get("imdbRating"),
        "vote_count": data.get("imdbVotes", ""),
        "runtime": runtime,
        "tagline": "",
        "homepage": "",
        "original_language": data.get("Language", ""),
        "source": "omdb",
        "source_id": imdb_id,
        "director": data.get("Director", ""),
        "actors": data.get("Actors", ""),
        "writer": data.get("Writer", ""),
        "awards": data.get("Awards", ""),
        "country": data.get("Country", ""),
        "box_office": data.get("BoxOffice", ""),
        "ratings": ratings,
    }


# ============================================
# TV detail fetch
# ============================================


def _get_tmdb_tv_detail(tv_id: str, api_key: str) -> dict:
    """Fetch full TV series details from TMDB by ID."""
    url = f"{TMDB_BASE}/tv/{tv_id}"
    params = {"api_key": api_key, "language": "zh-CN"}
    try:
        with make_client(timeout=5) as client:
            resp = client.get(url, params=params)
            resp.raise_for_status()
            data = resp.json()
    except Exception as e:
        raise RuntimeError(f"TMDB TV detail fetch failed: {e}")

    first_air = data.get("first_air_date", "")
    year = int(first_air[:4]) if first_air and len(first_air) >= 4 else None
    poster = data.get("poster_path")
    genres = [g["name"] for g in data.get("genres", []) if g.get("name")]
    # Number of seasons as a proxy for "runtime" for TV series
    seasons = data.get("number_of_seasons", 0)
    episodes = data.get("number_of_episodes", 0)

    return {
        "title": data.get("name", ""),
        "year": year,
        "genre": " / ".join(genres),
        "poster_url": f"{TMDB_IMAGE_BASE}{poster}" if poster else None,
        "overview": data.get("overview", ""),
        "rating": data.get("vote_average"),
        "vote_count": data.get("vote_count"),
        "runtime": None,  # TV series don't have a single runtime
        "tagline": data.get("tagline", ""),
        "homepage": data.get("homepage", ""),
        "original_language": data.get("original_language", ""),
        "source": "tmdb",
        "source_id": tv_id,
        "media_type": "tv",
        "seasons": seasons,
        "episodes": episodes,
    }


# ============================================
# TVmaze detail
# ============================================


def _get_tvmaze_detail(show_id: str) -> dict:
    """Fetch full TV series details from TVmaze by show ID.

    TVmaze is free and requires no API key. The response includes
    rich metadata: name, status, network, genres, summary, image,
    external IDs (IMDb, TheTVDB), and more.
    """
    url = f"{TVMAZE_BASE}/shows/{show_id}"
    try:
        with make_client(timeout=5) as client:
            resp = client.get(url)
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

    return {
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
        "media_type": "tv",
        "director": "",
        "actors": "",
        "writer": "",
        "awards": "",
        "country": network.get("country", {}).get("name", "") if network else "",
        "status": data.get("status", ""),
        "network": channel,
        "imdb_id": imdb_id if imdb_id.startswith("tt") else None,
        "thetvdb_id": str(thetvdb_id) if thetvdb_id else None,
        "seasons": None,
        "episodes": None,
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
