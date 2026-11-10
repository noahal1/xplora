"""One deep module that owns movie-metadata enrichment.

The chain here is: resolve an external identity -> fetch detail from TMDB /
TVmaze -> normalize ``media_type`` onto the detail dict -> cache the poster
locally -> persist through the crud layer -> reconcile ``scrape_error`` ->
shape the 18-field response. Previously this chain was written out twice in
``routers/media.py`` (once in ``enrich_media_metadata_endpoint`` and once in
``rematch_media``), with the same ``detail["media_type"]`` override, the same
``download_and_cache_poster`` block and the same 18-field literal duplicated.
Deleting those two copies concentrates the complexity here, behind one small
interface.

Routers are thin adapters: they resolve *which* source / id to use, then call
:func:`enrich`. ``search``, ``fetch_detail`` and ``cache_poster`` are optional
in-process adapters; injecting substitutes (together with the caller-supplied
``db``) makes this interface the test surface — no private helpers to reach
into and no network in a test.
"""

from dataclasses import dataclass
from typing import Any, Callable, Optional

from fastapi import HTTPException
from sqlmodel import Session

from crud import (
    clear_scrape_error,
    enrich_media_metadata,
    set_scrape_error,
)
from movie_search import get_movie_detail, search_movies
from poster_cache import download_and_cache_poster

_POSTER_FAILURE_MESSAGE = (
    "海报图片下载失败，已保留原始 TMDB 地址。可稍后重试「批量刮削」以缓存到本地"
)

# The single response shape returned to both callers. Keeping the literal
# here, rather than in two endpoints, is what makes deletion of the chain
# concentrate the complexity instead of scattering it.
_RESPONSE_FIELDS = (
    "id",
    "title",
    "rating",
    "year",
    "genre",
    "status",
    "poster_url",
    "overview",
    "runtime",
    "imdb_id",
    "tmdb_id",
    "country",
    "tagline",
    "scrape_error",
    "tv_series_id",
    "season_number",
    "episode_count",
    "series_poster_url",
)


@dataclass(frozen=True)
class Match:
    """A resolved external identity, ready to be enriched."""

    source: str
    source_id: str
    media_type: str = "movie"
    season_number: Optional[int] = None


def resolve_title(
    title: str,
    source: str,
    season_number: Optional[int] = None,
    *,
    search: Optional[Callable[..., list[dict]]] = None,
) -> Match:
    """Resolve a title to the best external match.

    Owns the search and the movie-vs-TV preference: TV results are only valid
    when the item was imported with a season marker, otherwise a movie is
    preferred so a title like "Interstellar" is not mis-tagged as a TV special.
    ``search`` is an optional adapter for the test surface.
    """
    do_search = search or search_movies
    source_label = "TMDB" if source == "tmdb" else "TVmaze"
    try:
        results = do_search(title, source)
    except RuntimeError as e:
        raise HTTPException(status_code=502, detail=f"搜索 {source_label} 失败：{str(e)}")

    if not results:
        raise HTTPException(
            status_code=404,
            detail=f"在 {source_label} 中未找到「{title}」的匹配结果，请先手动编辑标题再试",
        )

    if season_number:
        tv_results = [r for r in results if r.get("media_type") == "tv"]
        match = tv_results[0] if tv_results else results[0]
    else:
        movie_results = [r for r in results if r.get("media_type") != "tv"]
        match = movie_results[0] if movie_results else results[0]

    source_id = match.get("source_id", "")
    # Trust the match's own source: the search may have returned a result
    # from a different source than the one requested.
    match_source = match.get("source", source)
    if not source_id:
        raise HTTPException(status_code=502, detail=f"{match_source.upper()} 搜索结果缺少 source_id")

    media_type = match.get("media_type", "movie")
    # Refresh season-specific metadata when a TV item already has a season.
    resolved_season = season_number if media_type == "tv" else None
    return Match(
        source=match_source,
        source_id=source_id,
        media_type=media_type,
        season_number=resolved_season,
    )


def enrich(
    *,
    media_id: int,
    user_id: int,
    match: Match,
    db: Session,
    fetch_error_detail: Optional[str] = None,
    reconcile_scrape_error: bool = True,
    fetch_detail: Optional[Callable[..., dict]] = None,
    cache_poster: Optional[Callable[..., Optional[str]]] = None,
) -> dict[str, Any]:
    """Fetch -> normalize -> poster -> persist -> reconcile -> 18-field dict.

    ``fetch_detail`` / ``cache_poster`` are optional in-process adapters and
    ``db`` is already injected by the caller; together they make this one
    interface the test surface. ``fetch_error_detail`` is a ``{source}`` /
    ``{error}`` format template — when omitted the raw ``RuntimeError`` text
    is used (the rematch path). ``reconcile_scrape_error=False`` clears
    ``scrape_error`` unconditionally, matching the historical rematch path.
    """
    do_fetch = fetch_detail or get_movie_detail
    do_cache = cache_poster or download_and_cache_poster

    try:
        detail = do_fetch(
            match.source,
            match.source_id,
            media_type=match.media_type,
            season_number=match.season_number,
        )
    except RuntimeError as e:
        message = (
            fetch_error_detail.format(source=match.source.upper(), error=str(e))
            if fetch_error_detail is not None
            else str(e)
        )
        raise HTTPException(status_code=502, detail=message)

    # TMDB / TVmaze detail dicts don't carry media_type; set it so the crud
    # layer overwrites any stale value (e.g. a movie previously tagged "tv").
    detail["media_type"] = match.media_type

    poster_cached = False
    if detail.get("poster_url"):
        local_url = do_cache(
            detail["poster_url"],
            tmdb_id=detail.get("tmdb_id") or match.source_id,
        )
        if local_url:
            detail["poster_url"] = local_url
            poster_cached = True

    updated = enrich_media_metadata(media_id, user_id, detail, db=db)
    if not updated:
        raise HTTPException(status_code=404, detail="Media item not found")

    if reconcile_scrape_error:
        if poster_cached or not detail.get("poster_url"):
            clear_scrape_error(media_id, user_id, db=db)
        else:
            set_scrape_error(media_id, user_id, _POSTER_FAILURE_MESSAGE, db=db)
    else:
        clear_scrape_error(media_id, user_id, db=db)

    return {field: getattr(updated, field) for field in _RESPONSE_FIELDS}
