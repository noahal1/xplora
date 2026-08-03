"""Recommendation filtering: metadata resolution and watched-title filtering."""

from typing import Optional

from scraper.match import has_cjk, normalize, normalize_unicode, remove_special_chars, title_words
from config_manager import get_api_key as get_config_api_key
from movie_search import search_movies as search_external_movies

from .constants import logger


class FilterMixin:
    """Recommendation filtering: metadata resolution and watched-title filtering."""

    @staticmethod
    def _resolve_metadata(recs: list) -> list:
        """Search TMDB for each recommendation's poster URL + TMDB ID (parallel).

        Works with both ``list[MediaRecommendation]`` and ``list[dict]``.
        If TMDB is not configured, returns recs unchanged.
        Attaches ``poster_url`` and ``tmdb_id`` to each recommendation
        from the TMDB search results (``source_id`` field).

        **TMDB API optimization:**
        Searches with ``media_type="movie"`` first (covers most AI
        recommendations). If no poster is found, falls back to
        ``media_type="tv"`` for the specific title — avoiding the
        wasteful double-search of both endpoints for every rec.
        """
        tmdb_key = get_config_api_key("tmdb")
        if not tmdb_key or not recs:
            return recs

        from concurrent.futures import ThreadPoolExecutor

        is_dict = isinstance(recs[0], dict)

        def set_field(rec, key, value):
            if is_dict:
                rec[key] = value
            else:
                setattr(rec, key, value)

        def resolve_one(rec):
            title = rec.get("title", "") if is_dict else getattr(rec, "title", "")
            year = rec.get("year") if is_dict else getattr(rec, "year", None)
            if not title:
                return

            # ── Skip if already has TMDB metadata ─────────────────────
            # TMDB hybrid path already attaches tmdb_id + poster_url;
            # pure AI path may also have some recs with existing metadata
            # from earlier retries or from future code paths.
            existing_tmdb_id = rec.get("tmdb_id", "") if is_dict else getattr(rec, "tmdb_id", "")
            existing_poster = rec.get("poster_url", "") if is_dict else getattr(rec, "poster_url", "")
            if existing_tmdb_id and existing_poster:
                return

            try:
                # Step 1: Search movies only (covers vast majority of AI recommendations)
                results = search_external_movies(title, "tmdb", media_type="movie")
                if results:
                    year_match = next(
                        (r for r in results if r.get("year") == year and r.get("poster_url")),
                        None,
                    )
                    fallback = next((r for r in results if r.get("poster_url")), None)
                    match = year_match or fallback or results[0]
                    poster_url = match.get("poster_url")
                    source_id = match.get("source_id")
                    if poster_url:
                        set_field(rec, "poster_url", poster_url)
                        set_field(rec, "tmdb_id", source_id)
                        set_field(rec, "media_type", "movie")
                        return

                # Step 2: Fallback — if movie search didn't find anything, try TV
                tv_results = search_external_movies(title, "tmdb", media_type="tv")
                if tv_results:
                    year_match = next(
                        (r for r in tv_results if r.get("year") == year and r.get("poster_url")),
                        None,
                    )
                    fallback = next((r for r in tv_results if r.get("poster_url")), None)
                    match = year_match or fallback or tv_results[0]
                    poster_url = match.get("poster_url")
                    source_id = match.get("source_id")
                    if poster_url:
                        set_field(rec, "poster_url", poster_url)
                        set_field(rec, "tmdb_id", source_id)
                        set_field(rec, "media_type", "tv")
            except Exception:
                pass

        with ThreadPoolExecutor(max_workers=5) as pool:
            list(pool.map(resolve_one, recs))

        return recs


    @staticmethod
    def _filter_by_tmdb_id(recs: list, excluded_tmdb_ids: set[str] | None) -> list:
        """Filter out recommendations whose TMDB ID is in the excluded set.

        Runs **after** ``_resolve_metadata()`` has attached ``tmdb_id`` to
        each rec.  Catches cross-language duplicates (e.g. "Inception" vs
        "盗梦空间") that title-based fuzzy matching cannot handle.

        Works with both ``list[MediaRecommendation]`` and ``list[dict]``.
        Items without a TMDB ID are kept as-is (title-based fallback).
        """
        if not excluded_tmdb_ids:
            return recs

        is_dict = isinstance(recs[0], dict) if recs else False
        filtered = []
        for rec in recs:
            tmdb_id = rec.get("tmdb_id", "") if is_dict else getattr(rec, "tmdb_id", "")
            if tmdb_id and tmdb_id in excluded_tmdb_ids:
                title = rec.get("title", "") if is_dict else getattr(rec, "title", "")
                logger.info("[TMDB-ID] FILTERED OUT: '%s' (tmdb_id=%s)", title, tmdb_id)
                continue
            filtered.append(rec)
        return filtered


    @staticmethod
    def _filter_watched(recs: list, watched_titles: Optional[list[str]]) -> list:
        """Filter out recommendations that the user has already watched.

        Uses fuzzy title matching with Jaccard word-set similarity to
        catch duplicates across Unicode variants (Amélie → Amelie),
        punctuation differences, and formatting variations — while
        avoiding false positives for different franchise entries
        (e.g. "Batman" vs "Batman Begins").

        Matching strategy:
        - 1.00: Exact match (after normalize/lowercase/strip)
        - 0.90: Unicode-normalized + punctuation-stripped match
        - 0.00–1.00: Jaccard similarity of meaningful word sets

        Threshold: >= 0.70 is considered a match.

        Works with both MediaRecommendation objects and raw dicts.
        Handles None input gracefully.
        """
        if not watched_titles:
            return recs
        watched_clean = [t for t in watched_titles if t]
        if not watched_clean:
            return recs

        MATCH_THRESHOLD = 0.70

        def _match_score(a: str, b: str) -> float:
            """Jaccard-based similarity sans substring match.

            For CJK text where word-level Jaccard fails due to lack of
            whitespace (e.g. "荒蛮故事" vs "蛮荒故事"), falls back to
            character-level Jaccard — comparing the set of unique CJK
            characters rather than words.
            """
            a_norm = normalize(a)
            b_norm = normalize(b)
            if not a_norm or not b_norm:
                return 0.0
            if a_norm == b_norm:
                return 1.0
            a_clean = remove_special_chars(normalize_unicode(a_norm))
            b_clean = remove_special_chars(normalize_unicode(b_norm))
            if a_clean and b_clean and a_clean == b_clean:
                return 0.9
            words_a = title_words(a_norm)
            words_b = title_words(b_norm)
            word_jaccard = 0.0
            if words_a and words_b:
                intersection = words_a & words_b
                union = words_a | words_b
                word_jaccard = len(intersection) / len(union)

            # CJK character-level fallback: if both strings contain CJK
            # and word Jaccard is below threshold, compare by character
            # set.  Catches swapped-word-order cases like "荒蛮故事" vs
            # "蛮荒故事" (same 4 characters, different ordering).
            if word_jaccard < 0.70 and (has_cjk(a_norm) or has_cjk(b_norm)):
                chars_a = set(a_norm.replace(" ", ""))
                chars_b = set(b_norm.replace(" ", ""))
                if chars_a and chars_b:
                    # Require similar character set size to prevent
                    # matching different movies that happen to share
                    # common characters (e.g. "我和我的祖国" vs "我的祖国").
                    size_ratio = min(len(chars_a), len(chars_b)) / max(len(chars_a), len(chars_b))
                    if size_ratio < 0.80:
                        return word_jaccard
                    char_intersection = chars_a & chars_b
                    char_union = chars_a | chars_b
                    char_jaccard = len(char_intersection) / len(char_union)
                    return max(word_jaccard, char_jaccard)

            return word_jaccard

        def _is_watched(title: str) -> bool:
            """Check if a title matches any watched title using local fuzzy matching.

            Uses ``_match_score`` (Jaccard word similarity with CJK character
            fallback) — no external API calls.  Works for same-language
            comparisons (CJK↔CJK, EN↔EN).  Does NOT handle cross-language
            matching (e.g. "Inception" vs "盗梦空间") — those will not be
            detected as duplicates without a TMDB-based resolution step.
            """
            return any(_match_score(title, wt) >= MATCH_THRESHOLD for wt in watched_clean)

        # Track what's being filtered for debugging
        filtered = []
        for r in recs:
            title = r.get("title", "") if isinstance(r, dict) else getattr(r, "title", "")
            if not title:
                filtered.append(r)
                continue
            is_watched = _is_watched(title)
            if not is_watched:
                filtered.append(r)
            else:
                logger.info("[FilterDebug] FILTERED OUT (watched): '%s'", title)

        # Also deduplicate within the same batch — AI sometimes returns the same
        # movie twice in one response (exact title or fuzzy match).
        # Uses the same local ``_match_score``, no TMDB calls.
        seen_titles: list[str] = []
        deduped = []
        for r in filtered:
            title = r.get("title", "") if isinstance(r, dict) else getattr(r, "title", "")
            if not title:
                deduped.append(r)
                continue
            is_dup = any(_match_score(title, st) >= MATCH_THRESHOLD for st in seen_titles)
            if is_dup:
                logger.info("[FilterDebug] FILTERED OUT (duplicate in batch): '%s'", title)
                continue
            seen_titles.append(title)
            deduped.append(r)

        return deduped
