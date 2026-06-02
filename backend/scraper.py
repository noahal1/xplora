"""Background metadata scraper for imported movies.

Uses FastAPI BackgroundTasks to scrape TMDB/OMDb metadata asynchronously
after the import response has been sent, so the user doesn't have to wait.

Poster images are cached locally via :mod:`poster_cache` so the
application is not dependent on TMDB CDN availability.
"""

import logging
import re
import time
import unicodedata
from typing import Optional

from config_manager import get_api_key as get_config_api_key
from poster_cache import download_and_cache_poster

# Rate limiting — TMDB free tier allows ~50 req/s, but we're conservative
# to avoid hitting any issues and to be a good API citizen.
TMDB_REQUEST_DELAY = 0.25  # 250ms between requests (~4 req/s)

logger = logging.getLogger(__name__)


# ============================================
# Pinyin / CJK helpers
# ============================================


def _has_cjk(text: str) -> bool:
    """Check whether a string contains CJK (Chinese / Japanese / Korean) characters."""
    for ch in text:
        cp = ord(ch)
        # CJK Unified Ideographs + Extension A + CJK Unified Ideographs Extension B
        if (
            0x4E00 <= cp <= 0x9FFF
            or 0x3400 <= cp <= 0x4DBF
            or 0x20000 <= cp <= 0x2A6DF
        ):
            return True
    return False


def _to_pinyin(text: str) -> str | None:
    """Convert Chinese text to pinyin (``千与千寻`` → ``qian yu qian xun``).

    Returns ``None`` if the ``pypinyin`` library is not available, so
    callers can degrade gracefully.
    """
    if not _has_cjk(text):
        return None
    try:
        from pypinyin import lazy_pinyin

        words = lazy_pinyin(text)
        return " ".join(words)
    except ImportError:
        logger.debug("pypinyin not installed — skipping pinyin conversion")
        return None


# ============================================
# Title matching helpers
# ============================================

# Common stop words in movie titles (EN / FR / DE / ES / IT)
_STOP_WORDS: set[str] = {
    "the", "a", "an", "and", "or", "of", "in", "to", "for",
    "is", "it", "on", "at", "by", "with", "from", "as", "its",
    "das", "der", "die", "dem", "den", "des", "ein", "eine",
    "el", "la", "le", "les", "de", "un", "une", "du", "des",
    "il", "lo", "gli", "i", "gli",
    "y", "lo", "los", "las",
}


def _normalize(s: str) -> str:
    """Normalize a title for comparison: lowercase, strip, remove extra spaces."""
    return " ".join(s.lower().strip().split())


def _normalize_unicode(s: str) -> str:
    """Normalize Unicode characters, converting accented letters to ASCII.

    E.g. ``Amélie`` → ``Amelie``, ``Café`` → ``Cafe``.
    """
    nfkd = unicodedata.normalize("NFKD", s)
    return "".join(c for c in nfkd if not unicodedata.combining(c))


def _remove_special_chars(s: str) -> str:
    """Strip punctuation and special characters, keeping only letters,
    digits, and whitespace."""
    return re.sub(r"[^\w\s]", "", s)


def _title_words(s: str) -> set[str]:
    """Extract meaningful words from a title (lowercased, no stop words,
    no single letters, no punctuation)."""
    cleaned = _remove_special_chars(s)
    cleaned = _normalize_unicode(cleaned)
    words = cleaned.lower().split()
    return {w for w in words if w not in _STOP_WORDS and len(w) > 1}


def _word_overlap_ratio(a: str, b: str) -> float:
    """Jaccard-like word overlap between two titles.

    Returns the fraction of the smaller title's words that also appear
    in the larger title (``intersection / min(len_a, len_b)``).
    """
    words_a = _title_words(a)
    words_b = _title_words(b)
    if not words_a or not words_b:
        return 0.0
    intersection = words_a & words_b
    return len(intersection) / min(len(words_a), len(words_b))


def _titles_match(a: str, b: str) -> bool:
    """Check if two movie titles match, using progressively fuzzier strategies.

    1. Exact match (after basic normalization)
    2. Substring match
    3. Unicode-normalized + punctuation-stripped match
    4. Word overlap >= 70%
    """
    a = _normalize(a)
    b = _normalize(b)
    if not a or not b:
        return False

    # Strategy 1: Exact or substring
    if a == b or a in b or b in a:
        return True

    # Strategy 2: Remove accents + punctuation, then compare
    a_clean = _remove_special_chars(_normalize_unicode(a))
    b_clean = _remove_special_chars(_normalize_unicode(b))
    if not a_clean or not b_clean:
        return False
    if a_clean == b_clean or a_clean in b_clean or b_clean in a_clean:
        return True

    # Strategy 3: Word overlap fuzzy matching
    if _word_overlap_ratio(a, b) >= 0.7:
        return True

    return False


def _find_best_match(results: list[dict], title: str, year: Optional[int]) -> Optional[dict]:
    """Find the best matching TMDB result using fuzzy title similarity + year.

    Priority:
    1. Original title fuzzy match + year match
    2. Localized title fuzzy match + year match
    3. Year match (any title)
    4. Original title fuzzy match (no year)
    5. Localized title fuzzy match (no year)
    6. Word-overlap >= 70% (any result, no year)
    7. First result (fallback)
    """
    if not results:
        return None

    # Priority 1: original_title + year (best evidence)
    if year:
        for r in results:
            ot = r.get("original_title") or ""
            if _titles_match(ot, title) and r.get("year") == year:
                return r

    # Priority 2: localized title + year
    if year:
        for r in results:
            rt = r.get("title") or ""
            if _titles_match(rt, title) and r.get("year") == year:
                return r

    # Priority 3: year match + at least some title overlap
    if year:
        for r in results:
            if r.get("year") == year:
                ot = r.get("original_title") or ""
                rt = r.get("title") or ""
                combined = f"{ot} {rt}"
                if _word_overlap_ratio(combined, title) >= 0.3:
                    return r

    # Priority 4: original_title fuzzy match (no year)
    for r in results:
        ot = r.get("original_title") or ""
        if _titles_match(ot, title):
            return r

    # Priority 5: localized title fuzzy match (no year)
    for r in results:
        rt = r.get("title") or ""
        if _titles_match(rt, title):
            return r

    # Priority 6: word-overlap >= 50% (fallback for heavily different titles)
    for r in results:
        ot = r.get("original_title") or ""
        rt = r.get("title") or ""
        combined = f"{ot} {rt}"
        if _word_overlap_ratio(combined, title) >= 0.5:
            return r

    # No good match found — return None rather than attaching wrong metadata
    logger.info(
        "No confident match for '%s' (year=%s) among %d results",
        title, year, len(results),
    )
    return None


# ============================================
# Search helpers
# ============================================


def _search_tmdb(title: str) -> Optional[list[dict]]:
    """Search TMDB movies (dual-language) and return raw results list.

    Returns ``None`` if TMDB API key is not configured or the
    search request fails.
    """
    tmdb_key = get_config_api_key("tmdb")
    if not tmdb_key:
        logger.debug("TMDB key not configured — skipping TMDB search")
        return None

    from movie_search import search_movies

    try:
        return search_movies(title, "tmdb", dual_language=True)
    except RuntimeError as e:
        logger.warning("TMDB search failed for '%s': %s", title, e)
        return None


def _search_tmdb_tv(title: str) -> Optional[list[dict]]:
    """Search TMDB TV series (dual-language) and return raw results list.

    Returns ``None`` if TMDB API key is not configured or the
    search request fails.
    """
    tmdb_key = get_config_api_key("tmdb")
    if not tmdb_key:
        return None

    from movie_search import search_tmdb_tv_dual

    try:
        results = search_tmdb_tv_dual(title, tmdb_key)
        return [r.to_dict() for r in results]
    except RuntimeError as e:
        logger.warning("TMDB TV search failed for '%s': %s", title, e)
        return None


def _search_omdb(title: str, media_type: str = "movie") -> Optional[list[dict]]:
    """Search OMDb and return raw results list.

    Returns ``None`` if OMDb API key is not configured or the
    search request fails.

    Args:
        title: Search query.
        media_type: ``"movie"``, ``"series"``, or ``"episode"``.
    """
    omdb_key = get_config_api_key("omdb")
    if not omdb_key:
        logger.debug("OMDb key not configured — skipping OMDb search")
        return None

    from movie_search import search_omdb

    try:
        results = search_omdb(title, omdb_key, media_type=media_type)
        return [r.to_dict() for r in results]
    except RuntimeError as e:
        logger.warning("OMDb search failed for '%s': %s", title, e)
        return None


def _try_fetch_detail(source: str, source_id: str, title: str, year: Optional[int], media_type: str = "movie") -> Optional[dict]:
    """Fetch full detail from the given source and return the
    metadata dict, or ``None`` on any error.
    """
    from movie_search import get_movie_detail

    time.sleep(TMDB_REQUEST_DELAY)
    try:
        detail = get_movie_detail(source, source_id, media_type=media_type)
        logger.info(
            "Scraped metadata for '%s' (year=%s) → '%s' (%s:%s, type=%s)",
            title, year, detail.get("title"), source, source_id, media_type,
        )
        return detail
    except RuntimeError as e:
        logger.warning(
            "%s detail fetch failed for '%s' (ID:%s): %s",
            source.upper(), title, source_id, e,
        )
        return None


# ============================================
# Scraping logic
# ============================================


def scrape_movie_metadata(title: str, year: Optional[int]) -> Optional[dict]:
    """Scrape movie metadata from TMDB (and OMDb as fallback).

    Search strategy (in order):
    1. TMDB movies dual-language (zh-CN + en-US)
    2. TMDB movies + pinyin (if title contains CJK characters)
    3. TMDB TV series dual-language
    4. TMDB TV series + pinyin (if title contains CJK characters)
    5. OMDb movie search
    6. OMDb movie + pinyin (if title contains CJK characters)
    7. OMDb series search
    8. OMDb series + pinyin (if title contains CJK characters)

    Returns a metadata dict suitable for :func:`crud.enrich_movie_metadata`,
    or ``None`` if no match found.
    """
    tmdb_key = get_config_api_key("tmdb")
    omdb_key = get_config_api_key("omdb")

    if not tmdb_key and not omdb_key:
        logger.warning("No API keys configured (TMDB or OMDb) — skipping metadata scrape")
        return None

    tmp_pinyin = _to_pinyin(title) if _has_cjk(title) else None

    # ── 1. TMDB dual-language ─────────────────────────────────────
    if tmdb_key:
        results = _search_tmdb(title)
        if results:
            match = _find_best_match(results, title, year)
            if match and match.get("source_id"):
                detail = _try_fetch_detail("tmdb", match["source_id"], title, year)
                if detail:
                    return detail

        # ── 2. TMDB + pinyin ──────────────────────────────────────
        if tmp_pinyin:
            logger.info("TMDB no match, retrying with pinyin: '%s' → '%s'", title, tmp_pinyin)
            pinyin_results = _search_tmdb(tmp_pinyin)
            if pinyin_results:
                # Try matching pinyin results against the original Chinese title
                # first (in case TMDB returned mixed content). If that fails, try
                # matching against the pinyin query itself (most TMDB results will
                # have English/romanized titles).
                match = _find_best_match(pinyin_results, title, year)
                if not match or not match.get("source_id"):
                    match = _find_best_match(pinyin_results, tmp_pinyin, year)
                if match and match.get("source_id"):
                    detail = _try_fetch_detail("tmdb", match["source_id"], title, year)
                    if detail:
                        return detail

    # ── 3. TMDB TV series (fallback when movie search fails) ────
    if tmdb_key:
        logger.info("TMDB movie search failed, trying TV series: '%s'", title)
        tv_results = _search_tmdb_tv(title)
        if tv_results:
            match = _find_best_match(tv_results, title, year)
            if match and match.get("source_id"):
                detail = _try_fetch_detail("tmdb", match["source_id"], title, year, media_type="tv")
                if detail:
                    return detail

        # ── 4. TMDB TV + pinyin ───────────────────────────────────
        if tmp_pinyin:
            logger.info("TMDB TV no match, retrying with pinyin: '%s' → '%s'", title, tmp_pinyin)
            tv_pinyin_results = _search_tmdb_tv(tmp_pinyin)
            if tv_pinyin_results:
                match = _find_best_match(tv_pinyin_results, title, year)
                if not match or not match.get("source_id"):
                    match = _find_best_match(tv_pinyin_results, tmp_pinyin, year)
                if match and match.get("source_id"):
                    detail = _try_fetch_detail("tmdb", match["source_id"], title, year, media_type="tv")
                    if detail:
                        return detail

    # ── 5. OMDb movie ────────────────────────────────────────────
    if omdb_key:
        omdb_results = _search_omdb(title, media_type="movie")
        if omdb_results:
            match = _find_best_match(omdb_results, title, year)
            if match and match.get("source_id"):
                detail = _try_fetch_detail("omdb", match["source_id"], title, year)
                if detail:
                    return detail

        # ── 6. OMDb movie + pinyin ────────────────────────────────
        if tmp_pinyin:
            logger.info("OMDb movie no match, retrying with pinyin: '%s' → '%s'", title, tmp_pinyin)
            pinyin_results = _search_omdb(tmp_pinyin, media_type="movie")
            if pinyin_results:
                match = _find_best_match(pinyin_results, title, year)
                if not match or not match.get("source_id"):
                    match = _find_best_match(pinyin_results, tmp_pinyin, year)
                if match and match.get("source_id"):
                    detail = _try_fetch_detail("omdb", match["source_id"], title, year)
                    if detail:
                        return detail

    # ── 7. OMDb series ────────────────────────────────────────────
    if omdb_key:
        logger.info("OMDb movie search failed, trying series: '%s'", title)
        series_results = _search_omdb(title, media_type="series")
        if series_results:
            match = _find_best_match(series_results, title, year)
            if match and match.get("source_id"):
                detail = _try_fetch_detail("omdb", match["source_id"], title, year)
                if detail:
                    return detail

        # ── 8. OMDb series + pinyin ───────────────────────────────
        if tmp_pinyin:
            logger.info("OMDb series no match, retrying with pinyin: '%s' → '%s'", title, tmp_pinyin)
            series_pinyin_results = _search_omdb(tmp_pinyin, media_type="series")
            if series_pinyin_results:
                match = _find_best_match(series_pinyin_results, title, year)
                if not match or not match.get("source_id"):
                    match = _find_best_match(series_pinyin_results, tmp_pinyin, year)
                if match and match.get("source_id"):
                    detail = _try_fetch_detail("omdb", match["source_id"], title, year)
                    if detail:
                        return detail

    logger.info("No match found for '%s' (year=%s) in any source", title, year)
    return None


# ============================================
# Background task entry point
# ============================================


def background_enrich_movies(user_id: int, movie_ids: list[int]):
    """Background task: scrape and update metadata for all given movie IDs.

    Runs after the HTTP response has been sent (via FastAPI BackgroundTasks).
    Skips movies that already have ``poster_url`` populated.
    Processes movies sequentially with rate limiting between TMDB requests.
    On failure, the error reason is stored in ``scrape_error`` for debugging.
    """
    from crud import get_movie_for_user, enrich_movie_metadata, set_scrape_error, clear_scrape_error

    total = len(movie_ids)
    enriched = 0
    skipped = 0
    failed = 0

    logger.info(
        "Starting background enrichment for %d movies (user_id=%d)",
        total, user_id,
    )

    for idx, movie_id in enumerate(movie_ids):
        try:
            movie = get_movie_for_user(movie_id, user_id)
            if not movie:
                logger.warning("Movie %d not found — skipping", movie_id)
                set_scrape_error(movie_id, user_id, "电影记录不存在")
                failed += 1
                continue

            # Skip movies that already have metadata
            if movie.poster_url:
                skipped += 1
                continue

            metadata = scrape_movie_metadata(movie.title, movie.year)
            if not metadata:
                error_msg = _get_failure_reason(movie.title, movie.year)
                set_scrape_error(movie_id, user_id, error_msg)
                failed += 1
                continue

            # ── Poster local caching ────────────────────────────────
            # Try to download the poster image from TMDB CDN and cache
            # it locally. If the download fails (CDN blocked, timeout,
            # etc.), we keep the original TMDB URL in poster_url — no
            # worse than before — and set scrape_error to notify the
            # user that local caching failed.
            poster_cached = False
            if metadata.get("poster_url"):
                local_url = download_and_cache_poster(
                    metadata["poster_url"],
                    tmdb_id=metadata.get("tmdb_id") or metadata.get("source_id"),
                )
                if local_url:
                    metadata["poster_url"] = local_url
                    poster_cached = True

            updated = enrich_movie_metadata(movie_id, user_id, metadata)
            if updated:
                if poster_cached:
                    clear_scrape_error(movie_id, user_id)
                elif metadata.get("poster_url"):
                    # Has a poster_url (TMDB CDN URL) but local
                    # caching failed — keep the CDN URL as fallback
                    set_scrape_error(
                        movie_id, user_id,
                        "海报图片下载失败，已保留原始 TMDB 地址。"
                        "可稍后重试「批量刮削」以缓存到本地",
                    )
                enriched += 1
            else:
                set_scrape_error(movie_id, user_id, "数据库更新失败")
                failed += 1

            # Rate limit between movies
            time.sleep(TMDB_REQUEST_DELAY)

        except Exception as e:
            error_msg = str(e)[:200]  # Truncate to avoid huge messages
            try:
                set_scrape_error(movie_id, user_id, error_msg)
            except Exception:
                pass
            logger.exception("Unexpected error scraping movie %d: %s", movie_id, e)
            failed += 1

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
    """
    from crud import get_movie_for_user, enrich_movie_metadata, set_scrape_error, clear_scrape_error

    total = len(movie_ids)
    cached = 0
    skipped = 0
    failed = 0

    logger.info(
        "Starting poster cache for %d movies (user_id=%d)",
        total, user_id,
    )

    for movie_id, poster_url, tmdb_id in movie_ids:
        try:
            movie = get_movie_for_user(movie_id, user_id)
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
                # Poster URL went missing (shouldn't happen, but handle
                # gracefully)
                skipped += 1
                continue

            local_url = download_and_cache_poster(
                movie.poster_url,
                tmdb_id=tmdb_id or str(movie.id),
            )
            if local_url:
                # Update poster_url in DB to local path
                enrich_movie_metadata(movie_id, user_id, {"poster_url": local_url})
                clear_scrape_error(movie_id, user_id)
                cached += 1
            else:
                set_scrape_error(
                    movie_id, user_id,
                    "海报图片下载失败，已保留原始 TMDB 地址。"
                    "可稍后重试以缓存到本地",
                )
                failed += 1

        except Exception as e:
            logger.exception(
                "Unexpected error caching poster for movie %d: %s",
                movie_id, e,
            )
            failed += 1

    logger.info(
        "Poster cache complete for user_id=%d: "
        "%d cached, %d skipped, %d failed, out of %d total",
        user_id, cached, skipped, failed, total,
    )


def _get_failure_reason(title: str, year: Optional[int]) -> str:
    """Generate a human-readable error message for why scraping failed."""
    tmdb_key = get_config_api_key("tmdb")
    omdb_key = get_config_api_key("omdb")
    if not tmdb_key and not omdb_key:
        return "未配置任何 API Key（TMDB / OMDb）"
    sources_tried = []
    if tmdb_key:
        sources_tried.append("TMDB")
    if omdb_key:
        sources_tried.append("OMDb")
    sources_str = " / ".join(sources_tried)
    if year:
        return f"在 {sources_str} 中均未找到「{title} ({year})」的匹配结果"
    return f"在 {sources_str} 中均未找到「{title}」的匹配结果"
