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
from helpers import parse_movie_data, get_api_key
from ai_service import AIService
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


# ── Helpers ─────────────────────────────────────────────────────────


def _extract_watched_titles(movies: list[MediaRating]) -> list[str]:
    """Extract watched movie titles from the movie list."""
    return [m.title for m in movies if m.title]


def _get_all_excluded_tmdb_ids(db: Session, user_id: int) -> set[str]:
    """Query all watched + wishlist TMDB IDs from DB in a single query.

    Returns a set of TMDB IDs that the user already has in their
    library.  Used for exact ID matching in the TMDB ID filtering
    pass (``_filter_by_tmdb_id``).

    Items without a ``tmdb_id`` are skipped — they will fall back
    to title-based fuzzy matching.
    """
    rows = db.exec(
        select(MediaItemRecord.tmdb_id).where(
            MediaItemRecord.status.in_(["watched", "wish"]),
            MediaItemRecord.user_id == user_id,
            MediaItemRecord.tmdb_id.isnot(None),
        )
    ).all()
    return {str(r) for r in rows if r}


def _get_all_excluded_and_wishlist(db: Session, user_id: int) -> tuple[list[str], set[str]]:
    """Query ALL watched + wishlist titles from the DB in a single query.

    Returns a tuple:
        (excluded_titles, wishlist_titles)

    - excluded_titles: deduplicated list of all watched + wishlist movie titles
      that the AI should exclude from recommendations.
    - wishlist_titles: set of JUST wishlist titles for feedback analysis.

    Unlike ``_extract_watched_titles`` which only returns titles from the
    request payload (may be filtered by genre/media_type), this queries
    every item so the exclusion list is complete.

    NOTE: This query is intentionally genre-agnostic — it excludes ALL
    watched/wishlisted movies regardless of the recommendation strategy.
    The genre/media_type filter on the frontend only affects the taste
    analysis (which movies the AI sees as examples), NOT the exclusion.
    """
    rows = db.exec(
        select(MediaItemRecord).where(
            MediaItemRecord.status.in_(["watched", "wish"]),
            MediaItemRecord.user_id == user_id,
        )
    ).all()
    # Deduplicate by title (user could theoretically have same title in both lists)
    seen: set[str] = set()
    excluded: list[str] = []
    wishlist: set[str] = set()
    for item in rows:
        if item.title and item.title not in seen:
            seen.add(item.title)
            excluded.append(item.title)
            if item.status == "wish":
                wishlist.add(item.title)
    return excluded, wishlist


def _build_previous_feedback(db: Session, user_id: int, wishlist_titles: set[str] | None = None) -> dict:
    """Build feedback from past recommendation sessions.

    Cross-references past AI recommendations with the user's current
    wishlist to determine which recommendations were "liked" (added to
    wishlist) vs "ignored" (not acted upon).

    When ``wishlist_titles`` is provided, reuses the already-queried set
    instead of making a separate DB query.

    Returns a dict with:
        liked_titles: list[str] — recommendations the user appreciated
        ignored_titles: list[str] — recommendations the user didn't act on
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
        return {"liked_titles": [], "ignored_titles": []}

    from scraper.match import normalize

    liked: list[str] = []
    ignored: list[str] = []
    seen: set[str] = set()

    for session in past_sessions:
        for rec in session.recommendations:
            if not rec.title:
                continue
            norm = normalize(rec.title)
            if norm in seen:
                continue
            seen.add(norm)

            # Check if this recommended title is now in the user's wishlist
            # (fuzzy match against wishlist titles)
            is_in_wishlist = any(
                normalize(wt) == norm for wt in wishlist_titles
            )
            if is_in_wishlist:
                liked.append(rec.title)
            else:
                ignored.append(rec.title)

    return {
        "liked_titles": liked,
        "ignored_titles": ignored,
    }


# ── Helper: stream with persistence ─────────────────────────────────
# Note: Both _stream_with_persistence and _followup_stream_with_persistence
# are generators used inside StreamingResponse, which lives longer than the
# request scope. They manage their own DB session by not passing db=db,
# letting save_session create its own session.


def _stream_with_persistence(movies, count, model, api_key, user_id, strategy="taste", strategy_params=None, watched_titles=None, previous_feedback=None, excluded_tmdb_ids=None):
    """SSE generator that auto-saves recommendations to DB on completion."""
    service = AIService(api_key=api_key, model_type=model)
    taste_analysis = service._analyze_user_taste(movies)
    watched = watched_titles or _extract_watched_titles(movies)
    raw_generator = service.get_recommendations_stream(
        movies, count, strategy, strategy_params,
        watched_titles=watched,
        taste_analysis=taste_analysis,
        previous_feedback=previous_feedback,
        excluded_tmdb_ids=excluded_tmdb_ids,
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


def _followup_stream_with_persistence(movies, count, model, api_key, user_id, watched_titles=None, excluded_tmdb_ids=None, previous_recommendations=None, conversation=None, question=""):
    """SSE generator that auto-saves follow-up recommendations to DB on completion."""
    service = AIService(api_key=api_key, model_type=model)
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
async def recommend(
    request: RecommendationRequest,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_user_db),
):
    """Generate movie recommendations based on watched movies and ratings."""
    movies = parse_movie_data([m.model_dump() for m in request.movies])
    api_key = get_api_key(request.model)
    try:
        service = AIService(api_key=api_key, model_type=request.model)
        # Single DB query for all watched + wishlist titles + wishlist titles for feedback + TMDB IDs
        all_excluded, wishlist_titles = _get_all_excluded_and_wishlist(db, current_user["id"])
        excluded_tmdb_ids = _get_all_excluded_tmdb_ids(db, current_user["id"])
        previous_feedback = _build_previous_feedback(db, current_user["id"], wishlist_titles)
        taste_analysis = service._analyze_user_taste(movies)
        recommendations = service.get_recommendations(
            movies, request.count, request.strategy,
            request.strategy_params.model_dump() if request.strategy_params else None,
            watched_titles=all_excluded,
            taste_analysis=taste_analysis,
            previous_feedback=previous_feedback,
            excluded_tmdb_ids=excluded_tmdb_ids,
        )
        # Auto-save recommendations to DB (same as the streaming endpoint does)
        if recommendations:
            try:
                db_save_session(
                    model=request.model,
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
            model_used=request.model,
            source_count=len(movies),
        )
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"AI service error: {str(e)}")


@router.post("/stream")
async def recommend_stream(
    request: RecommendationRequest,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_user_db),
):
    """SSE streaming endpoint for movie recommendations. Auto-saves to DB."""
    movies = parse_movie_data([m.model_dump() for m in request.movies])
    api_key = get_api_key(request.model)
    # Single DB query for all watched + wishlist titles + wishlist titles for feedback + TMDB IDs
    all_excluded, wishlist_titles = _get_all_excluded_and_wishlist(db, current_user["id"])
    excluded_tmdb_ids = _get_all_excluded_tmdb_ids(db, current_user["id"])
    previous_feedback = _build_previous_feedback(db, current_user["id"], wishlist_titles)
    return StreamingResponse(
        _stream_with_persistence(
            movies, request.count, request.model, api_key, current_user["id"],
            strategy=request.strategy,
            strategy_params=request.strategy_params.model_dump() if request.strategy_params else None,
            watched_titles=all_excluded,
            previous_feedback=previous_feedback,
            excluded_tmdb_ids=excluded_tmdb_ids,
        ),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/followup")
async def followup_stream(
    request: FollowUpRequest,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_user_db),
):
    """SSE streaming endpoint for follow-up conversation. Auto-saves to DB."""
    movies = parse_movie_data([m.model_dump() for m in request.movies])
    api_key = get_api_key(request.model)
    # Single DB query for all watched + wishlist titles + TMDB IDs
    all_excluded, _ = _get_all_excluded_and_wishlist(db, current_user["id"])
    excluded_tmdb_ids = _get_all_excluded_tmdb_ids(db, current_user["id"])
    return StreamingResponse(
        _followup_stream_with_persistence(
            movies=movies,
            count=request.count,
            model=request.model,
            api_key=api_key,
            user_id=current_user["id"],
            watched_titles=all_excluded,
            excluded_tmdb_ids=excluded_tmdb_ids,
            previous_recommendations=request.previous_recommendations,
            conversation=request.conversation,
            question=request.question,
        ),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
