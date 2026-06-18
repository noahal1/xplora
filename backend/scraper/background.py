"""Background task entry points for metadata scraping and poster caching.

The synchronous functions (``background_enrich_movies``,
``background_cache_posters``) MUST be called via the async
wrappers (``async_background_enrich_movies``,
``async_background_cache_posters``) which run them in a
thread pool via :func:`asyncio.to_thread`.  Calling them directly
blocks the asyncio event loop and freezes the entire server for
the duration of the scrape.

All functions operate on the **user's personal database**
(``data/user_{id}.db``), creating their own sessions since
background tasks outlive the request-scoped DI session.
"""

import asyncio
import functools
import logging
import time
from typing import Optional

from config_manager import get_api_key as get_config_api_key
from database import get_user_session
from poster_cache import download_and_cache_poster
from scraper.match import has_cjk
from scraper.search import scrape_movie_metadata, TMDB_REQUEST_DELAY

logger = logging.getLogger(__name__)


def background_enrich_movies(user_id: int, movie_ids: list[int]):
    """Background task: scrape and update metadata for all given movie IDs.

    Runs after the HTTP response has been sent (via FastAPI BackgroundTasks).
    Skips movies that already have ``poster_url`` populated.
    Processes movies sequentially with rate limiting between TMDB requests.
    On failure, the error reason is stored in ``scrape_error`` for debugging.

    Uses the user's personal database session for all CRUD operations.
    """
    from crud import get_media_for_user, enrich_media_metadata, set_scrape_error, clear_scrape_error

    total = len(movie_ids)
    enriched = 0
    skipped = 0
    failed = 0

    logger.info(
        "Starting background enrichment for %d movies (user_id=%d)",
        total, user_id,
    )

    # Create a session to the user's personal database
    user_db = get_user_session(user_id)
    try:
        for idx, movie_id in enumerate(movie_ids):
            try:
                movie = get_media_for_user(movie_id, user_id, db=user_db)
                if not movie:
                    logger.warning("Movie %d not found — skipping", movie_id)
                    set_scrape_error(movie_id, user_id, "电影记录不存在", db=user_db)
                    failed += 1
                    continue

                # Skip movies that already have metadata AND the file exists on disk
                if movie.poster_url:
                    from poster_cache import local_poster_file_exists
                    if movie.poster_url.startswith("/static/"):
                        if local_poster_file_exists(movie.poster_url):
                            skipped += 1
                            continue
                        # File missing — re-scrape to re-download
                        logger.info(
                            "Poster file missing for '%s' (ID=%d) — re-scraping",
                            movie.title, movie.id,
                        )
                    else:
                        # External URL (TMDB CDN) — not cached yet;
                        # skip here because cache-posters handles these
                        skipped += 1
                        continue

                metadata = scrape_movie_metadata(movie.title, movie.year)
                if not metadata:
                    error_msg = _get_failure_reason(movie.title, movie.year)
                    set_scrape_error(movie_id, user_id, error_msg, db=user_db)
                    failed += 1
                    continue

                # ── Poster local caching ────────────────────────────────
                poster_cached = False
                if metadata.get("poster_url"):
                    local_url = download_and_cache_poster(
                        metadata["poster_url"],
                        tmdb_id=metadata.get("tmdb_id") or metadata.get("source_id"),
                    )
                    if local_url:
                        metadata["poster_url"] = local_url
                        poster_cached = True

                updated = enrich_media_metadata(movie_id, user_id, metadata, db=user_db)
                if updated:
                    if poster_cached:
                        clear_scrape_error(movie_id, user_id, db=user_db)
                    elif metadata.get("poster_url"):
                        set_scrape_error(
                            movie_id, user_id,
                            "海报图片下载失败，已保留原始 TMDB 地址。"
                            "可稍后重试「批量刮削」以缓存到本地",
                            db=user_db,
                        )
                    enriched += 1
                else:
                    set_scrape_error(movie_id, user_id, "数据库更新失败", db=user_db)
                    failed += 1

                # Rate limit between movies
                time.sleep(TMDB_REQUEST_DELAY)

            except Exception as e:
                error_msg = str(e)[:200]
                try:
                    set_scrape_error(movie_id, user_id, error_msg, db=user_db)
                except Exception:
                    pass
                logger.exception("Unexpected error scraping movie %d: %s", movie_id, e)
                failed += 1
    finally:
        user_db.close()

    logger.info(
        "Background enrichment complete for user_id=%d: "
        "%d enriched, %d skipped (already had poster), "
        "%d failed, out of %d total",
        user_id, enriched, skipped, failed, total,
    )


def background_cache_posters(user_id: int, movie_ids: list[tuple[int, str, str | None]]):
    """Background task: download and cache posters for movies that already
    have TMDB CDN URLs but haven't been cached locally yet.

    Each tuple is ``(movie_id, poster_url, tmdb_id_or_None)``.
    This is separate from :func:`background_enrich_movies` — it doesn't
    scrape metadata, it only downloads the poster image and updates
    ``poster_url`` to the local path.

    Uses the user's personal database session for all CRUD operations.
    """
    from crud import get_media_for_user, enrich_media_metadata, set_scrape_error, clear_scrape_error

    total = len(movie_ids)
    cached = 0
    skipped = 0
    failed = 0

    logger.info(
        "Starting poster cache for %d movies (user_id=%d)",
        total, user_id,
    )

    # Create a session to the user's personal database
    user_db = get_user_session(user_id)
    try:
        for movie_id, poster_url, tmdb_id in movie_ids:
            try:
                movie = get_media_for_user(movie_id, user_id, db=user_db)
                if not movie:
                    logger.warning("Movie %d not found — skipping", movie_id)
                    failed += 1
                    continue

                # If the poster_url was already updated to local by a
                # previous run, skip it
                if movie.poster_url and movie.poster_url.startswith("/static/"):
                    skipped += 1
                    continue

                if not movie.poster_url:
                    skipped += 1
                    continue

                local_url = download_and_cache_poster(
                    movie.poster_url,
                    tmdb_id=tmdb_id or str(movie.id),
                )
                if local_url:
                    enrich_media_metadata(movie_id, user_id, {"poster_url": local_url}, db=user_db)
                    clear_scrape_error(movie_id, user_id, db=user_db)
                    cached += 1
                else:
                    set_scrape_error(
                        movie_id, user_id,
                        "海报图片下载失败，已保留原始 TMDB 地址。"
                        "可稍后重试以缓存到本地",
                        db=user_db,
                    )
                    failed += 1

            except Exception as e:
                logger.exception(
                    "Unexpected error caching poster for movie %d: %s",
                    movie_id, e,
                )
                failed += 1
    finally:
        user_db.close()

    logger.info(
        "Poster cache complete for user_id=%d: "
        "%d cached, %d skipped, %d failed, out of %d total",
        user_id, cached, skipped, failed, total,
    )


async def async_background_enrich_movies(user_id: int, movie_ids: list[int]):
    """Run :func:`background_enrich_movies` in a thread pool so it
    doesn't block the asyncio event loop.

    FastAPI's ``BackgroundTasks`` runs added functions in the same
    event loop.  Since the enrich function does blocking I/O (HTTP
    requests, ``time.sleep``, database queries), calling it directly
    would freeze the entire server for the duration of the scrape.
    This wrapper offloads it to a thread via :func:`asyncio.to_thread`.
    """
    loop = asyncio.get_running_loop()
    await loop.run_in_executor(
        None,  # default thread pool executor
        functools.partial(background_enrich_movies, user_id, movie_ids),
    )


async def async_background_cache_posters(user_id: int, movies: list[tuple[int, str, str | None]]):
    """Run :func:`background_cache_posters` in a thread pool.
    Same rationale as :func:`async_background_enrich_movies`.
    """
    loop = asyncio.get_running_loop()
    await loop.run_in_executor(
        None,
        functools.partial(background_cache_posters, user_id, movies),
    )


def _get_failure_reason(title: str, year: Optional[int]) -> str:
    """Generate a human-readable error message for why scraping failed."""
    tmdb_key = get_config_api_key("tmdb")
    sources_tried = []
    if tmdb_key:
        sources_tried.append("TMDB")
    # TVmaze is free and always tried
    sources_tried.append("TVmaze")
    sources_str = " / ".join(sources_tried)
    if year:
        return f"在 {sources_str} 中均未找到「{title} ({year})」的匹配结果"
    return f"在 {sources_str} 中均未找到「{title}」的匹配结果"
