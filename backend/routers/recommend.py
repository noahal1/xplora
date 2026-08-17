"""Recommendation endpoints — sync, SSE streaming, and follow-up conversations."""

import json
import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException

logger = logging.getLogger(__name__)
from fastapi.responses import StreamingResponse
from sqlmodel import Session, select

from auth import get_current_user
from deps import get_user_db
from database import get_user_session
from helpers import parse_movie_data
from config_manager import get_api_key as get_config_api_key
from ai_service import AIService
from ai_service.constants import MODEL_CONFIGS
from crud import save_session as db_save_session, get_sessions as db_get_sessions
from models import (
    RecommendationRequest,
    RecommendationResponse,
    MediaRecommendation,
    FollowUpRequest,
    MediaRating,
    MediaItemRecord,
)

router = APIRouter(prefix="/api/recommend", tags=["recommend"])

# ``model_used`` value for the no-AI-key local (TMDB-only) path
LOCAL_MODEL = "local"


# ── Helpers ─────────────────────────────────────────────────────────


def _resolve_model(request_model: str) -> tuple[str, str]:
    """Resolve which model + API key to actually use.

    - ``local`` → local TMDB-only recommendations (no AI key needed)
    - ``ollama`` → local key-less model (placeholder key)
    - configured model → (model, key)
    - requested model without a key → falls back to local TMDB recs
      (the frontend prefers ``model_used`` from the response)
    """
    if request_model == LOCAL_MODEL:
        return LOCAL_MODEL, ""
    config = MODEL_CONFIGS.get(request_model)
    if not config:
        return LOCAL_MODEL, ""
    if config.get("requires_key") is False:
        return request_model, config.get("placeholder_key", "ollama")
    key = get_config_api_key(request_model)
    if key:
        return request_model, key
    return LOCAL_MODEL, ""


def _extract_watched_titles(movies: list[MediaRating]) -> list[str]:
    """Extract watched movie titles from the movie list."""
    return [m.title for m in movies if m.title]


def _load_user_library(db: Session, user_id: int, media_type: Optional[str] = None) -> dict:
    """Load all watched + wishlist items in a single DB query.

    Replaces the previous three separate queries:
    ``_get_all_excluded_and_wishlist``,
    ``_get_all_excluded_tmdb_ids``, and
    ``_select_source_movies_by_genre``.

    When ``media_type`` is provided (e.g. ``"movie"`` or ``"tv"``), only items
    of that type are loaded so the TMDB candidate pool and exclusion list
    respect the user's media type filter.

    Returns a dict with:
      - excluded_titles: list[str] — deduplicated titles for AI exclusion
      - wishlist_titles: set[str] — just wishlist titles for feedback
      - excluded_tmdb_ids: set[str] — all TMDB IDs for exact-match filtering
      - watched_with_tmdb: list — watched records with tmdb_id, sorted by
        rating desc, for genre-balanced source movie selection
    """
    query = select(MediaItemRecord).where(
        MediaItemRecord.status.in_(["watched", "wish"]),
        MediaItemRecord.user_id == user_id,
    )
    if media_type and media_type in ("movie", "tv"):
        query = query.where(MediaItemRecord.media_type == media_type)
    rows = db.exec(query.order_by(MediaItemRecord.rating.desc())).all()

    excluded_titles: list[str] = []
    wishlist_titles: set[str] = set()
    excluded_tmdb_ids: set[str] = set()
    watched_with_tmdb: list = []

    seen_titles: set[str] = set()

    for item in rows:
        # Titles for exclusion (dedup by title across both lists)
        if item.title and item.title not in seen_titles:
            seen_titles.add(item.title)
            excluded_titles.append(item.title)
            if item.status == "wish":
                wishlist_titles.add(item.title)

        # TMDB IDs for exact-match filtering (from both watched and wishlist)
        if item.tmdb_id:
            excluded_tmdb_ids.add(str(item.tmdb_id))

        # Watched + tmdb_id records for genre-balanced source movie selection
        if item.status == "watched" and item.tmdb_id:
            watched_with_tmdb.append(item)

    return {
        "excluded_titles": excluded_titles,
        "wishlist_titles": wishlist_titles,
        "excluded_tmdb_ids": excluded_tmdb_ids,
        "watched_with_tmdb": watched_with_tmdb,
    }


def _select_source_movies_by_genre(
    watched_with_tmdb: list,
    max_total: int = 15,
) -> list[tuple[str, str]]:
    """Select source movies for TMDB candidate pool using balanced genre grouping.

    Takes an already-queried list of watched MediaItemRecords (with tmdb_id)
    and distributes the ``max_total`` slots as evenly as possible across all
    genres.  Each genre gets ``floor(max_total / num_genres)`` or ``ceil`` for
    the first few genres.  If a genre has fewer movies than its allocation,
    the slack is redistributed to other genres.

    The input list should be pre-sorted by rating descending (done by
    ``_load_user_library``).

    Returns a list of ``(tmdb_id, media_type)`` tuples (e.g. ``("123", "movie")``
    or ``("456", "tv")``) so that downstream code can call the correct TMDB API
    (movie vs TV similar/recommendations).
    """
    from collections import defaultdict
    genre_groups: dict[str, list] = defaultdict(list)
    no_genre: list = []

    for m in watched_with_tmdb:
        if m.genre:
            primary = m.genre.split(" / ")[0].strip()
            genre_groups[primary].append(m)
        else:
            no_genre.append(m)

    selected: list[tuple[str, str]] = []
    seen_ids: set[str] = set()

    genres = sorted(genre_groups.keys())
    if not genres:
        # No genre data — just take top max_total
        for m in watched_with_tmdb[:max_total]:
            tid = str(m.tmdb_id)
            if tid not in seen_ids:
                seen_ids.add(tid)
                mt = getattr(m, "media_type", "movie") or "movie"
                selected.append((tid, mt))
        return selected

    # ── Distribute slots evenly across genres ────────────────────────
    num_genres = len(genres)
    base = max_total // num_genres          # floor per genre
    remainder = max_total - base * num_genres  # extra 1-topping genres

    # First pass: take each genre's fair share
    for idx, g in enumerate(genres):
        allocation = base + (1 if idx < remainder else 0)
        taken = 0
        for m in genre_groups[g]:
            if taken >= allocation:
                break
            tid = str(m.tmdb_id)
            if tid not in seen_ids:
                seen_ids.add(tid)
                mt = getattr(m, "media_type", "movie") or "movie"
                selected.append((tid, mt))
                taken += 1

    # Second pass: redistribute leftover slots from genres that had
    # fewer movies than their allocation
    if len(selected) < max_total:
        for g in genres:
            if len(selected) >= max_total:
                break
            for m in genre_groups[g]:
                if len(selected) >= max_total:
                    break
                tid = str(m.tmdb_id)
                if tid not in seen_ids:
                    seen_ids.add(tid)
                    mt = getattr(m, "media_type", "movie") or "movie"
                    selected.append((tid, mt))

    # Fill remaining slots with movies that have no genre
    if len(selected) < max_total:
        for m in no_genre:
            tid = str(m.tmdb_id)
            if tid not in seen_ids:
                seen_ids.add(tid)
                mt = getattr(m, "media_type", "movie") or "movie"
                selected.append((tid, mt))
                if len(selected) >= max_total:
                    break

    # Still not enough? Take any remaining high-rated movies
    if len(selected) < max_total:
        for m in watched_with_tmdb:
            tid = str(m.tmdb_id)
            if tid not in seen_ids:
                seen_ids.add(tid)
                mt = getattr(m, "media_type", "movie") or "movie"
                selected.append((tid, mt))
                if len(selected) >= max_total:
                    break

    return selected


def _enrich_playlist_strategy(
    db: Session,
    user_id: int,
    strategy: str,
    strategy_params_dict: Optional[dict],
    excluded_titles: list[str],
    excluded_tmdb_ids: set[str],
) -> tuple[dict, list[str], set[str]]:
    """For the 'playlist' strategy, load the selected playlist and its items.

    Injects playlist context (name / description / items) into
    ``strategy_params_dict`` so the AI can fill the playlist's theme, and
    adds the playlist's existing items to the exclusion lists so the AI
    never re-recommends titles already in the playlist.

    Returns ``(strategy_params_dict, excluded_titles, excluded_tmdb_ids)``.
    Non-playlist strategies return their inputs unchanged.
    """
    if strategy != "playlist":
        return strategy_params_dict, excluded_titles, excluded_tmdb_ids

    playlist_id = (strategy_params_dict or {}).get("playlist_id")
    if not playlist_id:
        return strategy_params_dict, excluded_titles, excluded_tmdb_ids

    from crud import get_playlist, list_items
    playlist = get_playlist(user_id, int(playlist_id), db)
    if not playlist:
        return strategy_params_dict, excluded_titles, excluded_tmdb_ids

    items = list_items(playlist.id, db)
    items_data = [
        {
            "title": i.title,
            "year": i.year,
            "genre": i.genre,
            "media_type": i.media_type,
            "tmdb_id": i.tmdb_id,
        }
        for i in items
    ]

    params = dict(strategy_params_dict or {})
    params["playlist_id"] = playlist.id
    params["playlist_name"] = playlist.name
    params["playlist_description"] = playlist.description or ""
    params["playlist_items"] = items_data

    # Exclude items already in the playlist so they're never re-recommended
    excluded_titles = list(excluded_titles)
    excluded_tmdb_ids = set(excluded_tmdb_ids)
    for i in items:
        if i.title:
            excluded_titles.append(i.title)
        if i.tmdb_id:
            excluded_tmdb_ids.add(str(i.tmdb_id))

    return params, excluded_titles, excluded_tmdb_ids


def _build_previous_feedback(
    db: Session, user_id: int,
    wishlist_titles: set[str] | None = None,
    excluded_titles: Optional[list[str]] = None,
) -> dict:
    """Build feedback from past recommendation sessions.

    Cross-references past AI recommendations with the user's current
    wishlist to determine which recommendations were "liked" (added to
    wishlist) vs "ignored" (not acted upon).

    When ``wishlist_titles`` is provided, reuses the already-queried set
    instead of making a separate DB query.

    When ``excluded_titles`` is provided, ``hard_ignore_titles`` are
    further filtered to remove any titles already on the exclusion list
    (watched or wishlisted).

    Returns a dict with:
        liked_titles: list[str] — recommendations the user appreciated
        ignored_titles: list[str] — recommendations the user didn't act on
        hard_ignore_titles: list[str] — titles to HARD-exclude from future
          recommendations (not in excluded_titles, not in wishlist)
    """
    if wishlist_titles is None:
        rows = db.exec(
            select(MediaItemRecord.title).where(
                MediaItemRecord.status == "wish",
                MediaItemRecord.user_id == user_id,
            )
        ).all()
        wishlist_titles = {r for r in rows if r}

    # Get last 5 sessions (most recent first)
    past_sessions, _ = db_get_sessions(user_id, page=0, page_size=5, db=db)
    if not past_sessions:
        return {
            "liked_titles": [],
            "ignored_titles": [],
            "hard_ignore_titles": [],
        }

    from scraper.match import normalize, title_similarity

    liked: list[str] = []
    ignored: list[str] = []
    hard_ignore: list[str] = []
    seen: set[str] = set()
    excluded_set = {normalize(t) for t in (excluded_titles or []) if t}

    def _is_already_excluded(title: str) -> bool:
        """Check if a recommendation title is already in the user's watched/wishlist."""
        if not excluded_set:
            return False
        from scraper.match import title_similarity
        return any(title_similarity(title, ex) >= 0.70 for ex in excluded_set)

    for session in past_sessions:
        for rec in session.recommendations:
            if not rec.title:
                continue
            norm = normalize(rec.title)
            if norm in seen:
                continue
            seen.add(norm)

            # Check if this recommended title is now in the user's wishlist
            is_in_wishlist = any(
                title_similarity(rec.title, wt) >= 0.70
                for wt in wishlist_titles
            )
            if is_in_wishlist:
                liked.append(rec.title)
            else:
                ignored.append(rec.title)
                # Also add to hard_exclude if not already watched/wishlisted
                if not _is_already_excluded(rec.title):
                    hard_ignore.append(rec.title)

    return {
        "liked_titles": liked,
        "ignored_titles": ignored,
        "hard_ignore_titles": hard_ignore,
    }


# ── Helper: stream with persistence ─────────────────────────────────
# Note: Both _stream_with_persistence and _followup_stream_with_persistence
# are generators used inside StreamingResponse, which lives longer than the
# request scope. They manage their own DB session by not passing db=db,
# letting save_session create its own session.


def _stream_with_persistence(movies, count, model, api_key, user_id, strategy="taste", strategy_params=None, watched_titles=None, previous_feedback=None, excluded_tmdb_ids=None, lang=None):
    """SSE generator that auto-saves recommendations to DB on completion."""
    service = AIService(api_key=api_key, model_type=model, user_id=user_id)
    taste_analysis = service._analyze_user_taste(movies)
    watched = watched_titles or _extract_watched_titles(movies)
    # Pass strategy_params so the streaming generator can extract user_tmdb_ids
    raw_generator = service.get_recommendations_stream(
        movies, count, strategy, strategy_params,
        watched_titles=watched,
        taste_analysis=taste_analysis,
        previous_feedback=previous_feedback,
        excluded_tmdb_ids=excluded_tmdb_ids,
        lang=lang,
    )
    recommendations_cache: list[dict] = []

    for event in raw_generator:
        if event.startswith("event: recommendation"):
            lines = event.split("\n")
            for line in lines:
                if line.startswith("data: "):
                    try:
                        rec_data = json.loads(line[6:])
                        recommendations_cache.append(rec_data)
                    except json.JSONDecodeError:
                        pass
        yield event
        if event.startswith("event: done"):
            try:
                rec_models = [
                    MediaRecommendation(
                        title=r.get("title", "Unknown"),
                        year=r.get("year"),
                        genre=r.get("genre"),
                        reason=r.get("reason", ""),
                        confidence=min(max(float(r.get("confidence", 0.5)), 0.0), 1.0),
                        tmdb_id=r.get("tmdb_id"),
                        media_type=r.get("media_type"),
                    )
                    for r in recommendations_cache
                ]
                if rec_models:
                    # Create a session to the user's personal database (streaming
                    # response outlives the request-scoped DI session, so we create
                    # our own session here)
                    user_session = get_user_session(user_id)
                    try:
                        db_save_session(
                            model=model,
                            source_count=len(movies),
                            movies=movies,
                            recommendations=rec_models,
                            user_id=user_id,
                            db=user_session,
                        )
                    finally:
                        user_session.close()
            except Exception as e:
                logger.warning("Error saving session: %s", e)


def _stream_local_with_persistence(movies, count, model, user_id, strategy="taste", strategy_params=None, watched_titles=None, excluded_tmdb_ids=None, lang=None):
    """SSE generator for the no-AI local (TMDB-only) recommendation path."""
    service = AIService(api_key="", model_type="deepseek", user_id=user_id)
    taste_analysis = service._analyze_user_taste(movies)
    try:
        recs = service.get_local_recommendations(
            movies, count, strategy, strategy_params,
            taste_analysis=taste_analysis,
            user_tmdb_ids=(strategy_params or {}).get("user_tmdb_ids"),
            excluded_tmdb_ids=excluded_tmdb_ids,
            lang=lang,
        )
    except ValueError as e:
        yield f"event: error\ndata: {json.dumps({'message': str(e)})}\n\n"
        return

    start_data = json.dumps({"model": LOCAL_MODEL, "source_count": len(movies)})
    yield f"event: start\ndata: {start_data}\n\n"

    for rec in recs:
        rec_data = json.dumps({
            "title": rec.title,
            "year": rec.year,
            "genre": rec.genre,
            "reason": rec.reason,
            "confidence": rec.confidence,
            "poster_url": rec.poster_url,
            "tmdb_id": rec.tmdb_id,
            "media_type": rec.media_type,
        }, ensure_ascii=False)
        yield f"event: recommendation\ndata: {rec_data}\n\n"

    done_data = json.dumps({
        "model_used": LOCAL_MODEL,
        "source_count": len(movies),
        "total": len(recs),
        "filtered_count": 0,
    })
    yield f"event: done\ndata: {done_data}\n\n"

    # Persist the session so history shows the local recommendations
    if recs:
        try:
            rec_models = [
                MediaRecommendation(
                    title=r.title,
                    year=r.year,
                    genre=r.genre,
                    reason=r.reason,
                    confidence=r.confidence,
                    tmdb_id=r.tmdb_id,
                    media_type=r.media_type,
                )
                for r in recs
            ]
            user_session = get_user_session(user_id)
            try:
                db_save_session(
                    model=LOCAL_MODEL,
                    source_count=len(movies),
                    movies=movies,
                    recommendations=rec_models,
                    user_id=user_id,
                    db=user_session,
                )
            finally:
                user_session.close()
        except Exception as e:
            logger.warning("Error saving local session: %s", e)


def _followup_stream_with_persistence(movies, count, model, api_key, user_id, watched_titles=None, excluded_tmdb_ids=None, previous_recommendations=None, conversation=None, question="", lang=None):
    """SSE generator that auto-saves follow-up recommendations to DB on completion."""
    service = AIService(api_key=api_key, model_type=model, user_id=user_id)
    taste_analysis = service._analyze_user_taste(movies)
    watched = watched_titles or _extract_watched_titles(movies)
    raw_generator = service.get_followup_stream(
        movies=movies,
        previous_recommendations=previous_recommendations or [],
        conversation=conversation or [],
        question=question,
        count=count,
        watched_titles=watched,
        taste_analysis=taste_analysis,
        excluded_tmdb_ids=excluded_tmdb_ids,
        lang=lang,
    )
    recommendations_cache: list[dict] = []

    for event in raw_generator:
        if event.startswith("event: result"):
            lines = event.split("\n")
            event_data = ""
            for line in lines:
                if line.startswith("data: "):
                    event_data = line[6:].strip()
                    break
            if event_data:
                try:
                    result = json.loads(event_data)
                    if result.get("type") == "recommendations":
                        recs = result.get("recommendations", [])
                        if recs:
                            recommendations_cache = recs
                except json.JSONDecodeError:
                    pass
        yield event

    # Save follow-up recs after result event has been yielded
    if recommendations_cache:
        try:
            rec_models = [
                MediaRecommendation(
                    title=r.get("title", "Unknown"),
                    year=r.get("year"),
                    genre=r.get("genre"),
                    reason=r.get("reason", ""),
                    confidence=min(max(float(r.get("confidence", 0.5)), 0.0), 1.0),
                    tmdb_id=r.get("tmdb_id"),
                    media_type=r.get("media_type"),
                )
                for r in recommendations_cache
            ]
            if rec_models:
                user_session = get_user_session(user_id)
                try:
                    db_save_session(
                        model=model,
                        source_count=len(movies),
                        movies=movies,
                        recommendations=rec_models,
                        user_id=user_id,
                        db=user_session,
                    )
                finally:
                    user_session.close()
        except Exception as e:
            logger.warning("Error saving follow-up session: %s", e)


# ── Endpoints ───────────────────────────────────────────────────────


@router.post("", response_model=RecommendationResponse)
def recommend(
    request: RecommendationRequest,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_user_db),
):
    """Generate movie recommendations based on watched movies and ratings.

    Deliberately a sync ``def`` (not ``async def``): the AI call blocks for
    up to minutes (60s timeout × retries). FastAPI runs sync endpoints in a
    thread pool, so this never blocks the event loop and other requests
    (health checks, login, other users) keep working.
    """
    movies = parse_movie_data([m.model_dump() for m in request.movies])
    model, api_key = _resolve_model(request.model)
    try:
        service = AIService(api_key=api_key, model_type=model if model != LOCAL_MODEL else "deepseek", user_id=current_user["id"])
        # Single DB query: titles + TMDB IDs + source movies — all in one
        mt_filter = (request.strategy_params or {}).media_type if request.strategy_params else None
        library = _load_user_library(db, current_user["id"], media_type=mt_filter)
        previous_feedback = _build_previous_feedback(
            db, current_user["id"],
            library["wishlist_titles"],
            excluded_titles=library["excluded_titles"],
        )
        taste_analysis = service._analyze_user_taste(movies)

        # ── Merge hard-ignored titles into exclusion list ────────────
        # Titles from past sessions that the user ignored (didn't add to
        # wishlist) get HARD-excluded so the AI won't re-recommend them.
        excluded_titles = library["excluded_titles"] + previous_feedback["hard_ignore_titles"]

        # ── Playlist strategy: inject playlist context + exclusions ──
        strategy_params_dict = request.strategy_params.model_dump() if request.strategy_params else None
        excluded_tmdb_ids = set(library["excluded_tmdb_ids"])
        strategy_params_dict, excluded_titles, excluded_tmdb_ids = _enrich_playlist_strategy(
            db, current_user["id"], request.strategy, strategy_params_dict,
            excluded_titles, excluded_tmdb_ids,
        )

        # ── Select source TMDB IDs for candidate pool ────────────────
        # Playlist strategy: source from the playlist's own items so the
        # TMDB candidate pool is theme-relevant; others: genre-balanced
        # watched movies.
        if request.strategy == "playlist" and strategy_params_dict and strategy_params_dict.get("playlist_items"):
            playlist_tmdb = [
                (str(i["tmdb_id"]), i.get("media_type") or "movie")
                for i in strategy_params_dict["playlist_items"] if i.get("tmdb_id")
            ]
            user_source_items = playlist_tmdb[:15]
        else:
            user_source_items = _select_source_movies_by_genre(library["watched_with_tmdb"])
        if user_source_items:
            if strategy_params_dict is None:
                strategy_params_dict = {}
            strategy_params_dict["user_tmdb_ids"] = user_source_items

        # ── Local (no-AI) path ────────────────────────────────────────
        if model == LOCAL_MODEL:
            recommendations = service.get_local_recommendations(
                movies, request.count, request.strategy,
                strategy_params_dict,
                taste_analysis=taste_analysis,
                user_tmdb_ids=strategy_params_dict.get("user_tmdb_ids") if strategy_params_dict else None,
                excluded_tmdb_ids=excluded_tmdb_ids,
                lang=request.lang,
            )
        else:
            recommendations = service.get_recommendations(
                movies, request.count, request.strategy,
                strategy_params_dict,
                watched_titles=excluded_titles,
                taste_analysis=taste_analysis,
                previous_feedback=previous_feedback,
                excluded_tmdb_ids=excluded_tmdb_ids,
                lang=request.lang,
            )
        # Auto-save recommendations to DB (same as the streaming endpoint does)
        if recommendations:
            try:
                db_save_session(
                    model=model,
                    source_count=len(movies),
                    movies=movies,
                    recommendations=recommendations,
                    user_id=current_user["id"],
                    db=db,
                )
            except Exception as e:
                logger.warning("Error saving session (sync): %s", e)
        return RecommendationResponse(
            recommendations=recommendations,
            model_used=model,
            source_count=len(movies),
        )
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"AI service error: {str(e)}")


@router.post("/stream")
def recommend_stream(
    request: RecommendationRequest,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_user_db),
):
    """SSE streaming endpoint for movie recommendations. Auto-saves to DB.

    Sync ``def`` (not ``async def``) — the pre-stream DB queries are
    blocking, and sync endpoints run in FastAPI's thread pool.
    """
    movies = parse_movie_data([m.model_dump() for m in request.movies])
    model, api_key = _resolve_model(request.model)
    # Single DB query: titles + TMDB IDs + source movies — all in one
    mt_filter = (request.strategy_params or {}).media_type if request.strategy_params else None
    library = _load_user_library(db, current_user["id"], media_type=mt_filter)
    previous_feedback = _build_previous_feedback(
        db, current_user["id"],
        library["wishlist_titles"],
        excluded_titles=library["excluded_titles"],
    )

    # ── Merge hard-ignored titles into exclusion list ────────────────
    excluded_titles = library["excluded_titles"] + previous_feedback["hard_ignore_titles"]

    # ── Playlist strategy: inject playlist context + exclusions ──
    strategy_params_dict = request.strategy_params.model_dump() if request.strategy_params else None
    excluded_tmdb_ids = set(library["excluded_tmdb_ids"])
    strategy_params_dict, excluded_titles, excluded_tmdb_ids = _enrich_playlist_strategy(
        db, current_user["id"], request.strategy, strategy_params_dict,
        excluded_titles, excluded_tmdb_ids,
    )

    # ── Select source TMDB IDs for candidate pool ────────────────
    if request.strategy == "playlist" and strategy_params_dict and strategy_params_dict.get("playlist_items"):
        playlist_tmdb = [
            (str(i["tmdb_id"]), i.get("media_type") or "movie")
            for i in strategy_params_dict["playlist_items"] if i.get("tmdb_id")
        ]
        user_source_items = playlist_tmdb[:15]
    else:
        user_source_items = _select_source_movies_by_genre(library["watched_with_tmdb"])
    if user_source_items:
        if strategy_params_dict is None:
            strategy_params_dict = {}
        strategy_params_dict["user_tmdb_ids"] = user_source_items

    # ── Local (no-AI) path uses its own SSE generator ────────────────
    if model == LOCAL_MODEL:
        return StreamingResponse(
            _stream_local_with_persistence(
                movies, request.count, LOCAL_MODEL, current_user["id"],
                strategy=request.strategy,
                strategy_params=strategy_params_dict,
                watched_titles=excluded_titles,
                excluded_tmdb_ids=excluded_tmdb_ids,
                lang=request.lang,
            ),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",
            },
        )

    return StreamingResponse(
        _stream_with_persistence(
            movies, request.count, model, api_key, current_user["id"],
            strategy=request.strategy,
            strategy_params=strategy_params_dict,
            watched_titles=excluded_titles,
            previous_feedback=previous_feedback,
            excluded_tmdb_ids=excluded_tmdb_ids,
            lang=request.lang,
        ),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/followup")
def followup_stream(
    request: FollowUpRequest,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_user_db),
):
    """SSE streaming endpoint for follow-up conversation. Auto-saves to DB.

    Sync ``def`` (not ``async def``) — the follow-up AI call blocks for a
    long time; sync endpoints run in FastAPI's thread pool.
    """
    movies = parse_movie_data([m.model_dump() for m in request.movies])
    model, api_key = _resolve_model(request.model)

    # Local mode has no conversational AI — return a friendly notice
    if model == LOCAL_MODEL:
        msg = (
            "本地推荐模式不支持追问对话。请配置 AI API Key（DeepSeek / OpenAI / Claude / Gemini）后使用。"
            if not request.lang == "en" else
            "Local recommendation mode doesn't support follow-up chat. Configure an AI API key (DeepSeek / OpenAI / Claude / Gemini) to use it."
        )

        def _local_followup():
            start = json.dumps({"model": LOCAL_MODEL})
            yield f"event: start\ndata: {start}\n\n"
            result = json.dumps({"type": "text", "message": msg}, ensure_ascii=False)
            yield f"event: result\ndata: {result}\n\n"

        return StreamingResponse(
            _local_followup(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",
            },
        )

    # Single DB query: titles + TMDB IDs — all in one (already filtered by initial recommendation)
    library = _load_user_library(db, current_user["id"])
    return StreamingResponse(
        _followup_stream_with_persistence(
            movies=movies,
            count=request.count,
            model=request.model,
            api_key=api_key,
            user_id=current_user["id"],
            watched_titles=library["excluded_titles"],
            excluded_tmdb_ids=library["excluded_tmdb_ids"],
            previous_recommendations=request.previous_recommendations,
            conversation=request.conversation,
            question=request.question,
            lang=request.lang,
        ),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
