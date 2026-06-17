"""Recommendation endpoints — sync, SSE streaming, and follow-up conversations."""

import json
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlmodel import Session, select

from auth import get_current_user
from deps import get_user_db
from database import get_user_session
from helpers import parse_movie_data, get_api_key
from ai_service import AIService
from crud import save_session as db_save_session
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


# ── Helper: stream with persistence ─────────────────────────────────
# Note: _stream_with_persistence is a generator used inside StreamingResponse,
# which lives longer than the request scope. It manages its own DB session
# by not passing db=db, letting save_session create its own session.


def _stream_with_persistence(movies, count, model, api_key, user_id, strategy="taste", strategy_params=None, watched_titles=None):
    """SSE generator that auto-saves recommendations to DB on completion."""
    service = AIService(api_key=api_key, model_type=model)
    taste_analysis = service._analyze_user_taste(movies)
    watched = watched_titles or _extract_watched_titles(movies)
    raw_generator = service.get_recommendations_stream(
        movies, count, strategy, strategy_params,
        watched_titles=watched,
        taste_analysis=taste_analysis,
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
                print(f"[DB] Error saving session: {e}")


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
        watched_titles = _extract_watched_titles(movies)
        # Also exclude wishlist items
        wishlist_items = db.exec(
            select(MediaItemRecord).where(
                MediaItemRecord.status == "wish",
                MediaItemRecord.user_id == current_user["id"],
            )
        ).all()
        wishlist_titles = [item.title for item in wishlist_items if item.title]
        all_excluded = list(set(watched_titles + wishlist_titles))
        taste_analysis = service._analyze_user_taste(movies)
        recommendations = service.get_recommendations(
            movies, request.count, request.strategy,
            request.strategy_params.model_dump() if request.strategy_params else None,
            watched_titles=all_excluded,
            taste_analysis=taste_analysis,
        )
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
    watched_titles = _extract_watched_titles(movies)
    # Also exclude wishlist items so the AI doesn't recommend movies the user
    # already plans to watch
    wishlist_items = db.exec(
        select(MediaItemRecord).where(
            MediaItemRecord.status == "wish",
            MediaItemRecord.user_id == current_user["id"],
        )
    ).all()
    wishlist_titles = [item.title for item in wishlist_items if item.title]
    all_excluded = list(set(watched_titles + wishlist_titles))
    return StreamingResponse(
        _stream_with_persistence(
            movies, request.count, request.model, api_key, current_user["id"],
            strategy=request.strategy,
            strategy_params=request.strategy_params.model_dump() if request.strategy_params else None,
            watched_titles=all_excluded,
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
    """SSE streaming endpoint for follow-up conversation."""
    movies = parse_movie_data([m.model_dump() for m in request.movies])
    api_key = get_api_key(request.model)
    service = AIService(api_key=api_key, model_type=request.model)
    watched_titles = _extract_watched_titles(movies)
    # Also exclude wishlist items
    wishlist_items = db.exec(
        select(MediaItemRecord).where(
            MediaItemRecord.status == "wish",
            MediaItemRecord.user_id == current_user["id"],
        )
    ).all()
    wishlist_titles = [item.title for item in wishlist_items if item.title]
    all_excluded = list(set(watched_titles + wishlist_titles))
    taste_analysis = service._analyze_user_taste(movies)
    return StreamingResponse(
        service.get_followup_stream(
            movies=movies,
            previous_recommendations=request.previous_recommendations,
            conversation=request.conversation,
            question=request.question,
            count=request.count,
            watched_titles=all_excluded,
            taste_analysis=taste_analysis,
        ),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
