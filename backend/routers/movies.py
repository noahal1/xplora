"""Movie, wishlist, and external search endpoints."""

from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query

from auth import get_current_user
from helpers import parse_movie_data
from models import (
    MovieData,
    MovieRating,
    WishlistData,
    WishlistItem,
    MarkAsWatchedRequest,
)
from crud import (
    save_movies,
    save_wishlist_items,
    get_movies as db_get_movies,
    get_movie_titles as db_get_movie_titles,
    get_movie_for_user,
    get_enrich_progress as db_get_enrich_progress,
    get_unenriched_movie_ids as db_get_unenriched_movie_ids,
    get_external_poster_movie_ids as db_get_external_poster_movie_ids,
    mark_movie_as_watched,
    update_movie as db_update_movie,
    delete_movie as db_delete_movie,
    batch_delete_movies as db_batch_delete_movies,
    delete_all_movies_for_user,
    db_delete_movies_by_status,
    enrich_movie_metadata as db_enrich_movie_metadata,
    clear_scrape_error as db_clear_scrape_error,
    set_scrape_error as db_set_scrape_error,
    log_operation,
)
from movie_search import search_movies as search_external_movies, get_movie_detail as get_external_movie_detail
from scraper import async_background_enrich_movies, async_background_cache_posters
from poster_cache import download_and_cache_poster

router = APIRouter(prefix="/api", tags=["movies"])


# ── Movie CRUD ──────────────────────────────────────────────────────


@router.post("/movies/replace")
async def replace_movies(
    request: MovieData,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(get_current_user),
):
    """Replace all watched movies for current user (clear + insert).

    Metadata enrichment (poster, overview, etc.) runs asynchronously
    in the background after the response is sent.
    """
    movies = parse_movie_data([m.model_dump() for m in request.movies])
    db_delete_movies_by_status(current_user["id"], "watched")
    records = save_movies(movies, current_user["id"], status="watched")

    # Launch background metadata scraping
    movie_ids = [r.id for r in records]
    if movie_ids:
        background_tasks.add_task(async_background_enrich_movies, current_user["id"], movie_ids)

    log_operation(current_user["id"], current_user["username"], "replace_watched", f"替换已看列表: {len(records)} 部电影")
    return {"status": "saved", "count": len(records)}


@router.get("/movies/titles")
async def list_movie_titles(
    current_user: dict = Depends(get_current_user),
):
    """Lightweight endpoint: return just movie titles for the current user."""
    titles = db_get_movie_titles(current_user["id"])
    return {"titles": titles}


@router.get("/movies")
async def list_movies(
    search: str = "",
    page: int = 0,
    page_size: int = 50,
    status: str = "",
    sort_field: str = "created_at",
    sort_dir: str = "desc",
    rating_min: Optional[float] = None,
    rating_max: Optional[float] = None,
    has_error: bool = False,
    media_type: str = "",
    current_user: dict = Depends(get_current_user),
):
    """List saved movies for current user. Optional filters: status ('watched'/'wish'), rating range, has_error, media_type ('movie'/'tv')."""
    status_filter = status if status in ("watched", "wish") else None
    media_type_filter = media_type if media_type in ("movie", "tv") else None
    records, total = db_get_movies(
        user_id=current_user["id"],
        search=search,
        page=page,
        page_size=page_size,
        status=status_filter,
        sort_field=sort_field,
        sort_dir=sort_dir,
        rating_min=rating_min,
        rating_max=rating_max,
        has_error=has_error or None,
        media_type=media_type_filter,
    )
    return {
        "movies": [
            {
                "id": r.id,
                "title": r.title,
                "rating": r.rating,
                "year": r.year,
                "genre": r.genre,
                "status": r.status,
                "media_type": r.media_type,
                "poster_url": r.poster_url,
                "overview": r.overview,
                "director": r.director,
                "actors": r.actors,
                "runtime": r.runtime,
                "imdb_id": r.imdb_id,
                "tmdb_id": r.tmdb_id,
                "country": r.country,
                "awards": r.awards,
                "tagline": r.tagline,
                "scrape_error": r.scrape_error,
                "created_at": r.created_at.isoformat(),
            }
            for r in records
        ],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@router.put("/movies/{movie_id}")
async def update_movie_endpoint(
    movie_id: int,
    data: dict,
    current_user: dict = Depends(get_current_user),
):
    """Update a saved movie (must belong to current user)."""
    updated = db_update_movie(
        movie_id=movie_id,
        user_id=current_user["id"],
        title=data.get("title"),
        rating=data.get("rating"),
        year=data.get("year"),
        genre=data.get("genre"),
        poster_url=data.get("poster_url"),
        overview=data.get("overview"),
        director=data.get("director"),
        actors=data.get("actors"),
        runtime=data.get("runtime"),
        imdb_id=data.get("imdb_id"),
        tmdb_id=data.get("tmdb_id"),
        country=data.get("country"),
        awards=data.get("awards"),
        tagline=data.get("tagline"),
        created_at=data.get("created_at"),
    )
    if not updated:
        raise HTTPException(status_code=404, detail="Movie not found")
    log_operation(current_user["id"], current_user["username"], "update_movie", f"更新电影: {updated.title} (ID: {movie_id})")
    return {
        "id": updated.id,
        "title": updated.title,
        "rating": updated.rating,
        "year": updated.year,
        "genre": updated.genre,
        "status": updated.status,
        "poster_url": updated.poster_url,
        "overview": updated.overview,
        "director": updated.director,
        "actors": updated.actors,
        "runtime": updated.runtime,
        "imdb_id": updated.imdb_id,
        "tmdb_id": updated.tmdb_id,
        "country": updated.country,
        "awards": updated.awards,
        "tagline": updated.tagline,
    }


@router.post("/movies/{movie_id}/enrich")
async def enrich_movie_metadata_endpoint(
    movie_id: int,
    current_user: dict = Depends(get_current_user),
):
    """Scrape metadata from TMDB for a movie by its title and update the record."""
    movie = get_movie_for_user(movie_id, current_user["id"])
    if not movie:
        raise HTTPException(status_code=404, detail="Movie not found")

    try:
        results = search_external_movies(movie.title, "tmdb")
    except RuntimeError as e:
        raise HTTPException(status_code=502, detail=f"搜索 TMDB 失败：{str(e)}")

    if not results:
        raise HTTPException(
            status_code=404,
            detail=f"在 TMDB 中未找到「{movie.title}」的匹配结果，请先手动编辑电影标题再试",
        )

    match = results[0]
    source_id = match.get("source_id", "")
    if not source_id:
        raise HTTPException(status_code=502, detail="TMDB 搜索结果缺少 source_id")

    # Pass media_type from search result so TV series use /tv/{id} instead of /movie/{id}
    media_type = match.get("media_type", "movie")
    try:
        detail = get_external_movie_detail("tmdb", source_id, media_type=media_type)
    except RuntimeError as e:
        raise HTTPException(
            status_code=502,
            detail=f"获取 TMDB 详情失败：{str(e)}。搜索已成功但获取详情失败，可能是 TMDB 限流或网络问题。",
        )

    # Localize the poster image (same as the background scrape path) so a
    # manually-enriched movie also gets a /static/posters/... URL that loads
    # even when the TMDB CDN is blocked client-side. On download failure we
    # keep the original CDN URL — no worse than before.
    poster_cached = False
    if detail.get("poster_url"):
        local_url = download_and_cache_poster(
            detail["poster_url"],
            tmdb_id=detail.get("tmdb_id") or source_id,
        )
        if local_url:
            detail["poster_url"] = local_url
            poster_cached = True

    updated = db_enrich_movie_metadata(movie_id, current_user["id"], detail)
    if not updated:
        raise HTTPException(status_code=404, detail="Movie not found")

    # Reconcile scrape_error: clear it when the poster cached locally (or there
    # was no poster); if a poster existed but local caching failed, keep the CDN
    # URL and record the same message the background path uses.
    if poster_cached or not detail.get("poster_url"):
        db_clear_scrape_error(movie_id, current_user["id"])
    else:
        db_set_scrape_error(
            movie_id, current_user["id"],
            "海报图片下载失败，已保留原始 TMDB 地址。可稍后重试「批量刮削」以缓存到本地",
        )

    return {
        "id": updated.id,
        "title": updated.title,
        "rating": updated.rating,
        "year": updated.year,
        "genre": updated.genre,
        "status": updated.status,
        "poster_url": updated.poster_url,
        "overview": updated.overview,
        "director": updated.director,
        "actors": updated.actors,
        "runtime": updated.runtime,
        "imdb_id": updated.imdb_id,
        "tmdb_id": updated.tmdb_id,
        "country": updated.country,
        "awards": updated.awards,
        "tagline": updated.tagline,
        "scrape_error": updated.scrape_error,
    }


@router.post("/movies/{movie_id}/mark-watched")
async def mark_as_watched(
    movie_id: int,
    request: MarkAsWatchedRequest,
    current_user: dict = Depends(get_current_user),
):
    """Move a wishlist movie to watched with a rating."""
    updated = mark_movie_as_watched(
        movie_id=movie_id,
        user_id=current_user["id"],
        rating=request.rating,
    )
    if not updated:
        raise HTTPException(
            status_code=404,
            detail="Movie not found or already marked as watched",
        )
    log_operation(current_user["id"], current_user["username"], "mark_watched", f"标记已看: {updated.title}")
    return {
        "id": updated.id,
        "title": updated.title,
        "rating": updated.rating,
        "year": updated.year,
        "genre": updated.genre,
        "status": updated.status,
    }


@router.delete("/movies/{movie_id}")
async def delete_movie(
    movie_id: int,
    current_user: dict = Depends(get_current_user),
):
    """Delete a saved movie (must belong to current user)."""
    deleted = db_delete_movie(movie_id, current_user["id"])
    if not deleted:
        raise HTTPException(status_code=404, detail="Movie not found")
    log_operation(current_user["id"], current_user["username"], "delete_movie", f"删除电影 ID: {movie_id}")
    return {"status": "deleted"}


@router.post("/movies/batch-delete")
async def batch_delete_movies_endpoint(
    request: dict,
    current_user: dict = Depends(get_current_user),
):
    """Batch delete movies by IDs."""
    ids = request.get("ids", [])
    if not isinstance(ids, list) or len(ids) == 0:
        raise HTTPException(status_code=400, detail="请提供要删除的电影 ID 列表")
    count = db_batch_delete_movies(ids, current_user["id"])
    log_operation(current_user["id"], current_user["username"], "batch_delete_movies", f"批量删除: {count} 部电影")
    return {"status": "deleted", "count": count}


@router.get("/movies/enrich-status")
async def get_enrich_status(
    current_user: dict = Depends(get_current_user),
):
    """Get the status of background metadata enrichment for the current user.

    "Processed" means the movie either has a poster_url (success) or has
    a scrape_error set (failure — TMDB couldn't find a match, etc.).
    "Pending" = total - processed, so it reaches 0 even for unmatched films.
    """
    total, processed, failed = db_get_enrich_progress(current_user["id"])
    return {
        "total": total,
        "enriched": processed - failed,
        "failed": failed,
        "processed": processed,
        "pending": total - processed,
    }


@router.post("/movies/enrich-all")
async def enrich_all_movies(
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(get_current_user),
):
    """Launch background metadata scraping for all movies without posters.

    Finds all movies for the current user that don't have a ``poster_url``
    yet, then enqueues a background task to scrape their metadata from
    TMDB. Returns immediately — the scraping runs asynchronously.
    """
    movie_ids = db_get_unenriched_movie_ids(current_user["id"])
    if not movie_ids:
        return {"status": "ok", "enqueued": 0, "message": "All movies already have metadata"}

    background_tasks.add_task(async_background_enrich_movies, current_user["id"], movie_ids)
    log_operation(current_user["id"], current_user["username"], "enrich_all", f"批量刮削: {len(movie_ids)} 部电影")
    return {"status": "ok", "enqueued": len(movie_ids)}


@router.post("/movies/cache-posters")
async def cache_posters(
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(get_current_user),
):
    """Download and cache posters for movies that already have TMDB CDN
    URLs but haven't been cached locally yet.

    This is a lighter operation than ``/enrich-all`` — it doesn't scrape
    metadata, it only downloads the poster image from the existing
    ``poster_url`` and saves it to the local filesystem.

    Returns immediately; the caching runs asynchronously in the
    background.
    """
    movies = db_get_external_poster_movie_ids(current_user["id"])
    if not movies:
        return {"status": "ok", "enqueued": 0, "message": "All posters already cached locally"}

    background_tasks.add_task(async_background_cache_posters, current_user["id"], movies)
    log_operation(current_user["id"], current_user["username"], "cache_posters", f"缓存海报: {len(movies)} 部")
    return {"status": "ok", "enqueued": len(movies)}


@router.delete("/movies")
async def delete_all_movies_endpoint(
    current_user: dict = Depends(get_current_user),
):
    """Delete all saved movies for current user."""
    count = delete_all_movies_for_user(current_user["id"])
    log_operation(current_user["id"], current_user["username"], "clear_all_movies", f"清空所有电影: {count} 部")
    return {"status": "deleted", "count": count}


# ── External Movie Search ───────────────────────────────────────────


@router.get("/movies/search")
async def search_movies(
    q: str = Query(..., min_length=1, description="Search query"),
    source: str = Query("auto", pattern="^(tmdb|omdb|tvmaze|auto)$", description="Data source: tmdb, omdb, tvmaze, or auto"),
    current_user: dict = Depends(get_current_user),
):
    """Search for movies via external sources (TMDB / OMDb)."""
    try:
        results = search_external_movies(q, source)
        log_operation(current_user["id"], current_user["username"], "search", f"搜索: {q} (来源: {source})")
        return {"results": results}
    except RuntimeError as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.post("/movies/{movie_id}/rematch")
async def rematch_movie(
    movie_id: int,
    request: dict,
    current_user: dict = Depends(get_current_user),
):
    """Manually rematch a movie to a specific search result.

    Accepts ``{"source": "tmdb", "source_id": "12345"}``, fetches
    the full detail from the source, updates the movie's metadata fields
    (poster, overview, director, actors, etc.), clears ``scrape_error``,
    and downloads+caches the poster locally.

    The movie's original ``title`` / ``year`` / ``genre`` from the user's
    import are NOT overwritten — only TMDB/OMDb metadata fields are
    updated, matching the behavior of auto-scraping.
    """
    source = request.get("source", "")
    source_id = request.get("source_id", "")
    media_type = request.get("media_type", "movie")
    if not source or not source_id:
        raise HTTPException(status_code=400, detail="需要提供 source 和 source_id")
    if source not in ("tmdb", "omdb", "tvmaze"):
        raise HTTPException(status_code=400, detail="source 只能是 tmdb、omdb 或 tvmaze")

    movie = get_movie_for_user(movie_id, current_user["id"])
    if not movie:
        raise HTTPException(status_code=404, detail="Movie not found")

    try:
        detail = get_external_movie_detail(source, source_id, media_type=media_type)
    except RuntimeError as e:
        raise HTTPException(status_code=502, detail=str(e))

    # Download and cache poster locally
    poster_cached = False
    if detail.get("poster_url"):
        local_url = download_and_cache_poster(
            detail["poster_url"],
            tmdb_id=detail.get("tmdb_id") or source_id,
        )
        if local_url:
            detail["poster_url"] = local_url
            poster_cached = True

    # Update metadata fields (preserves user's title/year)
    updated = db_enrich_movie_metadata(movie_id, current_user["id"], detail)
    if not updated:
        raise HTTPException(status_code=404, detail="Movie not found")

    # Clear scrape_error on success
    db_clear_scrape_error(movie_id, current_user["id"])

    log_operation(current_user["id"], current_user["username"], "rematch_movie", f"手动匹配: {updated.title}")
    return {
        "id": updated.id,
        "title": updated.title,
        "rating": updated.rating,
        "year": updated.year,
        "genre": updated.genre,
        "status": updated.status,
        "poster_url": updated.poster_url,
        "overview": updated.overview,
        "director": updated.director,
        "actors": updated.actors,
        "runtime": updated.runtime,
        "imdb_id": updated.imdb_id,
        "tmdb_id": updated.tmdb_id,
        "country": updated.country,
        "awards": updated.awards,
        "tagline": updated.tagline,
        "scrape_error": updated.scrape_error,
    }


@router.get("/movies/detail")
async def movie_detail(
    source: str = Query(..., pattern="^(tmdb|omdb)$", description="Data source: tmdb or omdb"),
    source_id: str = Query(..., min_length=1, description="Movie ID from the source"),
    media_type: str = Query("movie", pattern="^(movie|tv)$", description="Media type: movie or tv"),
    current_user: dict = Depends(get_current_user),
):
    """Fetch full movie details from external source."""
    try:
        detail = get_external_movie_detail(source, source_id, media_type=media_type)
        return detail
    except RuntimeError as e:
        raise HTTPException(status_code=502, detail=str(e))


# ── Wishlist ────────────────────────────────────────────────────────


@router.post("/wishlist/replace")
async def replace_wishlist(
    request: WishlistData,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(get_current_user),
):
    """Replace all wishlist items for current user (clear + insert).

    Metadata enrichment runs asynchronously in the background.
    """
    items = []
    for m in request.movies:
        if not m.title or not m.title.strip():
            continue
        items.append(
            WishlistItem(
                title=m.title.strip(),
                year=m.year,
                genre=m.genre,
            )
        )
    db_delete_movies_by_status(current_user["id"], "wish")
    records = save_wishlist_items(items, current_user["id"])

    # Launch background metadata scraping
    movie_ids = [r.id for r in records]
    if movie_ids:
        background_tasks.add_task(async_background_enrich_movies, current_user["id"], movie_ids)

    log_operation(current_user["id"], current_user["username"], "replace_wishlist", f"替换想看列表: {len(records)} 部电影")
    return {"status": "saved", "count": len(records)}


@router.post("/wishlist")
async def add_to_wishlist(
    request: WishlistItem,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(get_current_user),
):
    """Add a single movie to the wishlist.

    Metadata enrichment runs asynchronously in the background.
    """
    records = save_wishlist_items([request], current_user["id"])
    if not records:
        raise HTTPException(status_code=400, detail="Failed to add movie")
    r = records[0]

    # Launch background metadata scraping for this single movie
    background_tasks.add_task(async_background_enrich_movies, current_user["id"], [r.id])

    log_operation(current_user["id"], current_user["username"], "add_to_wishlist", f"添加到想看: {r.title}")
    return {
        "id": r.id,
        "title": r.title,
        "year": r.year,
        "genre": r.genre,
        "status": r.status,
    }


@router.delete("/wishlist")
async def clear_wishlist(
    current_user: dict = Depends(get_current_user),
):
    """Delete all wishlist items for current user."""
    count = db_delete_movies_by_status(current_user["id"], "wish")
    log_operation(current_user["id"], current_user["username"], "clear_wishlist", f"清空想看列表: {count} 部")
    return {"status": "deleted", "count": count}
