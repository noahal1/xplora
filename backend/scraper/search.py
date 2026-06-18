"""Search helper functions for metadata scraping."""

import concurrent.futures
import logging
import time
from typing import Optional

from config_manager import get_api_key as get_config_api_key
from scraper.match import has_cjk, to_pinyin, find_best_match, strip_season, extract_season_number

# Rate limiting — TMDB free tier allows ~50 req/s, but we're conservative
# to avoid hitting any issues and to be a good API citizen.
TMDB_REQUEST_DELAY = 0.25  # 250ms between requests (~4 req/s)

logger = logging.getLogger(__name__)


def search_tmdb(title: str) -> Optional[list[dict]]:
    """Search TMDB movies only (dual-language) and return raw results list.

    Uses ``search_tmdb_dual`` directly (movie-only endpoint) rather than
    ``search_movies`` which goes through ``_search_tmdb_variants`` and
    redundantly searches TV series too. The separate ``search_tmdb_tv``
    call in ``scrape_movie_metadata`` handles TV exclusively.

    Returns ``None`` if TMDB API key is not configured or the
    search request fails.
    """
    tmdb_key = get_config_api_key("tmdb")
    if not tmdb_key:
        logger.debug("TMDB key not configured — skipping TMDB search")
        return None

    from movie_search import search_tmdb_dual

    try:
        raw = search_tmdb_dual(title, tmdb_key)
        return [r.to_dict() for r in raw]
    except RuntimeError as e:
        logger.warning("TMDB search failed for '%s': %s", title, e)
        return None


def search_tmdb_tv(title: str) -> Optional[list[dict]]:
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


def search_tvmaze(title: str) -> Optional[list[dict]]:
    """Search TVmaze and return raw results list.

    TVmaze is a free TV database that requires no API key.
    Returns ``None`` only on request failure.
    """
    from movie_search import search_tvmaze

    try:
        results = search_tvmaze(title)
        return [r.to_dict() for r in results]
    except RuntimeError as e:
        logger.warning("TVmaze search failed for '%s': %s", title, e)
        return None


def try_fetch_detail(source: str, source_id: str, title: str, year: Optional[int], media_type: str = "movie", season_number: Optional[int] = None) -> Optional[dict]:
    """Fetch full detail from the given source and return the
    metadata dict, or ``None`` on any error.

    If ``season_number`` is set and source is TMDB TV, also fetches
    ``/tv/{id}/season/{n}`` and merges season-specific data.
    """
    from movie_search import get_movie_detail

    time.sleep(TMDB_REQUEST_DELAY)
    try:
        detail = get_movie_detail(source, source_id, media_type=media_type, season_number=season_number)
        logger.info(
            "Scraped metadata for '%s' (year=%s) → '%s' (%s:%s, type=%s%s)",
            title, year, detail.get("title"), source, source_id, media_type,
            f", season={season_number}" if season_number else "",
        )
        return detail
    except RuntimeError as e:
        logger.warning(
            "%s detail fetch failed for '%s' (ID:%s): %s",
            source.upper(), title, source_id, e,
        )
        return None



def _get_search_variants(title: str) -> list[str]:
    """Generate search title variants for combined / season-specific formats.

    For ``"千与千寻 / Spirited Away"``, yields:
    ``["千与千寻 / Spirited Away", "千与千寻", "Spirited Away"]``

    For ``"黑袍纠察队 第四季 / The Boys Season 4"``, also adds clean variants:
    ``["黑袍纠察队 第四季 / The Boys Season 4", "黑袍纠察队 第四季",
       "The Boys Season 4", "黑袍纠察队", "The Boys"]``
    """
    variants = [title]
    parts = []
    if " / " in title:
        for part in title.split(" / "):
            part = part.strip()
            if part and part not in variants:
                variants.append(part)
                parts.append(part)
    else:
        parts = [title]

    # Add season-free variants for each part
    for part in parts:
        clean = strip_season(part)
        if clean and clean not in variants and clean != part:
            variants.append(clean)

    return variants


_TVMAZE_PREFERRED = {"network", "status", "thetvdb_id"}


def _search_scrape(
    search_fn,
    title: str,
    year: Optional[int],
    variants: list[str],
    source: str,
    media_type: str = "movie",
    season_number: Optional[int] = None,
) -> Optional[dict]:
    """Try a search function with each title variant until one matches.

    If the title contains ``" / "`` (e.g. ``"千与千寻 / Spirited Away"``),
    first tries a **dual-variant consensus** check: search the left and
    right parts independently; if both match the same ``source_id``,
    that is treated as the highest-confidence match and returned immediately.

    If no consensus is found (or the title has no slash), falls back to
    the normal per-variant search.

    If ``season_number`` is set and source is TMDB TV, the detail
    fetch also gets season-specific data.

    Returns the metadata dict on success, ``None`` otherwise.
    """
    # ── Dual-variant consensus for " / " titles ─────────────────────
    # When both the Chinese and English parts of a slash-separated title
    # independently match the same source_id, we have extremely high
    # confidence — no need to iterate variants separately.
    if " / " in title:
        parts = [p.strip() for p in title.split(" / ")]
        # parts[0]=left side, parts[1]=right side (and beyond if multiple slashes)
        part_results: list[Optional[dict]] = []
        for p in parts:
            p_results = search_fn(p)
            if not p_results:
                part_results.append(None)
                continue
            match = find_best_match(p_results, p, year)
            part_results.append(match if match and match.get("source_id") else None)

        # Check if at least two non-None matches agree on source_id
        non_none = [r for r in part_results if r is not None]
        if len(non_none) >= 2:
            sid = non_none[0]["source_id"]
            if all(r["source_id"] == sid for r in non_none[1:]):
                logger.info(
                    "Dual-variant consensus for '%s': both '%s' and '%s' agree on %s:%s",
                    title, parts[0], parts[1], source, sid,
                )
                detail = try_fetch_detail(
                    source, sid, title, year,
                    media_type=media_type, season_number=season_number,
                )
                if detail:
                    return detail

    # ── Normal per-variant search ──────────────────────────────────
    # Skip parts already searched by the consensus check above
    already_searched = set(parts) if " / " in title else set()
    for variant in variants:
        if variant in already_searched:
            continue
        results = search_fn(variant)
        if not results:
            continue
        match = find_best_match(results, variant, year)
        if match and match.get("source_id"):
            detail = try_fetch_detail(
                source, match["source_id"], title, year,
                media_type=media_type, season_number=season_number,
            )
            if detail:
                return detail
    return None


def _merge_into(collected: dict, new: dict, source: str):
    """Merge a metadata dict into ``collected`` with field-level priorities.

    Priority rules:
    - TMDB: base (core fields like poster, overview, runtime, genre),
      never overwritten by others
    - TVmaze: fills gaps for ``network``, ``status``, ``thetvdb_id``
    - TVmaze: also fills ``imdb_id`` / ``country`` if not already set
    """
    for key, value in new.items():
        if value is None or key in ("source", "source_id", "media_type"):
            continue
        if key not in collected:
            collected[key] = value
        elif source == "tvmaze" and key in _TVMAZE_PREFERRED:
            collected[key] = value


def _try_source(
    search_fn,
    title: str,
    year: Optional[int],
    variants: list[str],
    variant_pinyins: dict[str, str | None],
    source: str,
    media_type: str = "movie",
    season_number: Optional[int] = None,
) -> Optional[dict]:
    """Try a search source with variants, then fall back to pinyin.

    If ``season_number`` is set and source is TMDB TV, also fetches
    season-specific data from ``/tv/{id}/season/{n}`` on match.
    """
    detail = _search_scrape(
        search_fn, title, year, variants, source,
        media_type=media_type, season_number=season_number,
    )
    if detail:
        return detail
    # Try pinyin for each variant that has CJK
    for v in variants:
        p = variant_pinyins.get(v)
        if not p:
            continue
        logger.info("%s no match, retrying with pinyin: '%s' → '%s'", source.upper(), v, p)
        results = search_fn(p)
        if not results:
            continue
        # Try matching pinyin results against the original variant first, then pinyin
        match = find_best_match(results, v, year)
        if not match or not match.get("source_id"):
            match = find_best_match(results, p, year)
        if match and match.get("source_id"):
            detail = try_fetch_detail(
                source, match["source_id"], title, year,
                media_type=media_type, season_number=season_number,
            )
            if detail:
                return detail
    return None


def scrape_movie_metadata(title: str, year: Optional[int]) -> Optional[dict]:
    """Scrape movie metadata from TMDB, TVmaze.

    Collects results from ALL sources and merges them with field-level
    priorities to build the most complete metadata possible.

    Merge priorities:
    - TMDB: core fields (poster, overview, runtime, genre, rating)
    - TVmaze: fills network, status, thetvdb_id, imdb_id, country

    For all sources, if the title contains ``" / "`` (e.g. ``"千与千寻 / Spirited Away"``)
    or season markers (``第四季`` / ``Season 4``), each part is tried separately.

    Returns a metadata dict suitable for :func:`crud.enrich_movie_metadata`,
    or ``None`` if no match found in any source.
    """
    tmdb_key = get_config_api_key("tmdb")

    if not tmdb_key:
        logger.warning("No TMDB API key configured — will only use TVmaze")

    # Parse season number from title (e.g., "黑袍纠察队 第四季" → 4)
    season_number = extract_season_number(title)
    if season_number:
        logger.info("Detected season %d in title '%s'", season_number, title)

    # Build search variants: original title, split parts, season-free parts
    title_variants = _get_search_variants(title)
    if len(title_variants) > 1:
        logger.info(
            "Title contains ' / ' or season markers — will also try variants: %s",
            title_variants[1:],
        )

    # Pinyin for each variant (if it contains CJK)
    variant_pinyins: dict[str, str | None] = {}
    for v in title_variants:
        variant_pinyins[v] = to_pinyin(v) if has_cjk(v) else None

    # ── Parallel search across all sources ─────────────────────────
    # All source searches (TMDB movie/TV, TVmaze)
    # are independent — they make HTTP requests to different APIs.
    # Running them concurrently (with connection reuse) massively
    # reduces wall-clock time vs. the original serial loop.
    from concurrent.futures import ThreadPoolExecutor

    tmdb_movie_found = False
    tmdb_tv_found = False
    collected: dict = {}

    with ThreadPoolExecutor(max_workers=5) as pool:
        futures: dict[str, concurrent.futures.Future] = {}

        if tmdb_key:
            futures["tmdb_movie"] = pool.submit(
                _try_source, search_tmdb,
                title, year, title_variants, variant_pinyins, "tmdb",
            )
        if tmdb_key:
            futures["tmdb_tv"] = pool.submit(
                _try_source, search_tmdb_tv,
                title, year, title_variants, variant_pinyins, "tmdb",
                "tv", season_number,
            )
        futures["tvmaze"] = pool.submit(
            _try_source, search_tvmaze,
            title, year, title_variants, variant_pinyins, "tvmaze",
        )

        # Collect results in merge-priority order:
        # TMDB first (base fields), then TVmaze (fills gaps)
        for name in ("tmdb_movie", "tmdb_tv", "tvmaze"):
            fut = futures.get(name)
            if not fut:
                continue
            try:
                detail = fut.result()
            except Exception as exc:
                logger.warning("Parallel %s search failed for '%s': %s", name, title, exc)
                continue
            if not detail:
                continue

            if name == "tmdb_movie":
                tmdb_movie_found = True
                _merge_into(collected, detail, "tmdb")
                logger.info(
                    "TMDB movie merged for '%s': poster=%s, overview=%s, runtime=%s",
                    title,
                    detail.get("poster_url") is not None,
                    detail.get("overview") is not None,
                    detail.get("runtime"),
                )
            elif name == "tmdb_tv":
                tmdb_tv_found = True
                _merge_into(collected, detail, "tmdb")
                logger.info(
                    "TMDB TV merged for '%s' — media_type=%s%s",
                    title, detail.get("media_type"),
                    f", season={season_number}" if season_number else "",
                )
            elif name == "tvmaze":
                _merge_into(collected, detail, "tvmaze")
                logger.info(
                    "TVmaze merged for '%s' — network=%s, status=%s",
                    title,
                    detail.get("network"),
                    detail.get("status"),
                )

    if not collected:
        logger.info("No match found for '%s' (year=%s) in any source", title, year)
        return None

    # ── Determine media_type ──────────────────────────────────────────
    # media_type is excluded from _merge_into to prevent TV search results
    # from incorrectly tagging a movie as TV (e.g. Interstellar matching
    # a TV special/documentary on TMDB). Here we determine it correctly:
    # - If season_number is set → TV (user explicitly specified a season)
    # - If TMDB movie match found → movie
    # - If only TMDB TV match found → TV
    # - Default → movie
    if season_number:
        collected["media_type"] = "tv"
    elif tmdb_movie_found:
        collected["media_type"] = "movie"
    elif tmdb_tv_found:
        collected["media_type"] = "tv"
    else:
        collected.setdefault("media_type", "movie")

    logger.info(
        "Scraping complete for '%s' — merged %d fields from %d sources, media_type=%s",
        title, len(collected), len({v.get("source") for v in [collected] if v.get("source")}),
        collected.get("media_type"),
    )
    return collected
