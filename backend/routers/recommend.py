"""Recommendation endpoints — sync, SSE streaming, and follow-up conversations."""

import json

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlmodel import Session

from auth import get_current_user
from database import get_db
from helpers import parse_movie_data, get_api_key
from ai_service import AIService
from crud import save_session as db_save_session
from models import (
    RecommendationRequest,
    RecommendationResponse,
    MediaRecommendation,
    FollowUpRequest,
    MediaRating,
)

router = APIRouter(prefix="/api/recommend", tags=["recommend"])


# ── Helper: stream with persistence ─────────────────────────────────
# Note: _stream_with_persistence is a generator used inside StreamingResponse,
# which lives longer than the request scope. It manages its own DB session
# by not passing db=db, letting save_session create its own session.


def _stream_with_persistence(movies, count, model, api_key, user_id, strategy="taste", strategy_params=None):
    """SSE generator that auto-saves recommendations to DB on completion."""
    service = AIService(api_key=api_key, model_type=model)
    raw_generator = service.get_recommendations_stream(movies, count, strategy, strategy_params)
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
                    # Uses its own session (no db=db) since streaming response
                    # outlives the request-scoped DI session
                    db_save_session(
                        model=model,
                        source_count=len(movies),
                        movies=movies,
                        recommendations=rec_models,
                        user_id=user_id,
                    )
            except Exception as e:
                print(f"[DB] Error saving session: {e}")


# ── Endpoints ───────────────────────────────────────────────────────


@router.post("", response_model=RecommendationResponse)
async def recommend(
    request: RecommendationRequest,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Generate movie recommendations based on watched movies and ratings."""
    movies = parse_movie_data([m.model_dump() for m in request.movies])
    api_key = get_api_key(request.model)
    try:
        service = AIService(api_key=api_key, model_type=request.model)
        recommendations = service.get_recommendations(
            movies, request.count, request.strategy,
            request.strategy_params.model_dump() if request.strategy_params else None,
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
):
    """SSE streaming endpoint for movie recommendations. Auto-saves to DB."""
    movies = parse_movie_data([m.model_dump() for m in request.movies])
    api_key = get_api_key(request.model)
    return StreamingResponse(
        _stream_with_persistence(
            movies, request.count, request.model, api_key, current_user["id"],
            strategy=request.strategy,
            strategy_params=request.strategy_params.model_dump() if request.strategy_params else None,
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
):
    """SSE streaming endpoint for follow-up conversation."""
    movies = parse_movie_data([m.model_dump() for m in request.movies])
    api_key = get_api_key(request.model)
    service = AIService(api_key=api_key, model_type=request.model)
    return StreamingResponse(
        service.get_followup_stream(
            movies=movies,
            previous_recommendations=request.previous_recommendations,
            conversation=request.conversation,
            question=request.question,
            count=request.count,
        ),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
