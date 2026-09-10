"""User profile endpoints — embedding, memory, and taste profile management.

Provides:
- POST /api/profile/embed — trigger BGE-M3 embedding for user's movies
- GET  /api/profile/memories — list user's taste memories
- POST /api/profile/memories/generate — generate memories via LLM
- GET  /api/profile/overview — get user's taste profile
- POST /api/profile/rebuild — full profile rebuild
"""

import json
import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel import Session, select, func

from auth import get_current_user
from deps import get_user_db
from helpers import iso_utc
from models import (
    MediaItemRecord,
    UserProfileRecord,
    UserMemoryRecord,
    MovieEmbeddingRecord,
    UserPreferencesRecord,
)

from ai_service.embedding import get_configured_provider

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/profile", tags=["profile"])


# ---------------------------------------------------------------------------
# Embedding endpoints
# ---------------------------------------------------------------------------

# Batch size for incremental embedding commits (for real-time progress)
_EMBED_BATCH_SIZE = 10


def _background_embed_all(user_id: int):
    """Background task: embed ALL un-embedded watched movies for a user.

    Commits in small batches so the /embed/stats endpoint reflects
    real-time progress.  Idempotent — already-embedded movies are skipped.
    """
    import json as _json
    import logging as _logging
    from sqlmodel import select as _select
    from database import get_user_session
    from models import MediaItemRecord as _MIR, MovieEmbeddingRecord as _MER, UserPreferencesRecord as _UPR
    from ai_service.embedding import EmbeddingPipeline, build_movie_embedding_text

    _log = _logging.getLogger(__name__)
    try:
        db = get_user_session(user_id)
        try:
            # Check RAG preference
            prefs = db.exec(
                _select(_UPR).where(_UPR.user_id == user_id)
            ).first()
            if prefs and not prefs.rag_enabled:
                _log.debug("Skipping embedding for user %d: rag_enabled=False", user_id)
                return

            # Fetch all watched movies
            movies = db.exec(
                _select(_MIR).where(
                    _MIR.user_id == user_id,
                    _MIR.status == "watched",
                )
            ).all()

            if not movies:
                return

            # Fetch existing embeddings
            existing_titles = {
                r.title.lower()
                for r in db.exec(
                    _select(_MER).where(_MER.user_id == user_id)
                ).all()
            }

            new_movies = [m for m in movies if m.title.lower() not in existing_titles]
            if not new_movies:
                return

            pipeline = EmbeddingPipeline()

            # Process in batches for real-time progress
            for batch_start in range(0, len(new_movies), _EMBED_BATCH_SIZE):
                batch = new_movies[batch_start: batch_start + _EMBED_BATCH_SIZE]
                texts = [
                    build_movie_embedding_text(
                        title=m.title, year=m.year, genre=m.genre,
                        rating=m.rating, overview=m.overview,
                    )
                    for m in batch
                ]

                result = pipeline.embed_texts(texts)

                for i, movie in enumerate(batch):
                    record = _MER(
                        user_id=user_id,
                        media_item_id=movie.id,
                        title=movie.title,
                        year=movie.year,
                        genre=movie.genre,
                        rating=movie.rating,
                        media_type=movie.media_type or "movie",
                        tmdb_id=movie.tmdb_id,
                        embedding_dense=_json.dumps(result["dense"][i]),
                        embedding_sparse=_json.dumps(result["sparse"][i]) if result.get("sparse") else None,
                        embedding_text=texts[i],
                    )
                    db.add(record)

                db.commit()
                _log.info(
                    "Embedded batch %d-%d/%d for user %d",
                    batch_start + 1,
                    min(batch_start + _EMBED_BATCH_SIZE, len(new_movies)),
                    len(new_movies),
                    user_id,
                )

        finally:
            db.close()
    except Exception:
        _log.exception("Background embedding failed for user %d", user_id)


@router.post("/embed")
async def trigger_embedding(
    current_user: dict = Depends(get_current_user),
    background_tasks=None,
):
    """Trigger BGE-M3 embedding for all watched movies.

    Runs as a background task so the frontend can poll /embed/stats
    for real-time progress.
    """
    from fastapi.concurrency import run_in_threadpool
    import threading

    user_id = current_user["id"]

    # Fire-and-forget in a thread so the response returns immediately
    thread = threading.Thread(target=_background_embed_all, args=(user_id,), daemon=True)
    thread.start()

    return {"status": "started", "message": "嵌入任务已启动"}


@router.get("/embed/stats")
async def embedding_stats(
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_user_db),
):
    """Get embedding statistics for the current user."""
    user_id = current_user["id"]

    total_movies = db.exec(
        select(func.count(MediaItemRecord.id)).where(
            MediaItemRecord.user_id == user_id,
            MediaItemRecord.status == "watched",
        )
    ).one()

    embedded_count = db.exec(
        select(func.count(MovieEmbeddingRecord.id)).where(
            MovieEmbeddingRecord.user_id == user_id,
        )
    ).one()

    return {
        "total_movies": total_movies or 0,
        "embedded_movies": embedded_count or 0,
        "embedding_provider": get_configured_provider(),
    }


# ---------------------------------------------------------------------------
# Memory endpoints
# ---------------------------------------------------------------------------

@router.get("/memories")
async def list_memories(
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_user_db),
):
    """List the current user's taste memories."""
    user_id = current_user["id"]
    memories = db.exec(
        select(UserMemoryRecord).where(
            UserMemoryRecord.user_id == user_id,
            UserMemoryRecord.is_active == True,  # noqa: E712
        ).order_by(UserMemoryRecord.created_at.desc())
    ).all()

    return {
        "memories": [
            {
                "id": m.id,
                "text": m.memory_text,
                "type": m.memory_type,
                "confidence": m.confidence,
                "related_movies": json.loads(m.related_movies) if m.related_movies else [],
                "created_at": iso_utc(m.created_at),
            }
            for m in memories
        ]
    }


@router.post("/memories/generate")
async def generate_memories_endpoint(
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_user_db),
    model: Optional[str] = Query(None, description="LLM model to use (deepseek/openai)"),
):
    """Generate taste memories via LLM for the current user."""
    from ai_service.memory import generate_memories
    from ai_service.constants import resolve_api_key

    user_id = current_user["id"]

    # Fetch movies and existing memories
    movies = db.exec(
        select(MediaItemRecord).where(
            MediaItemRecord.user_id == user_id,
            MediaItemRecord.status == "watched",
        )
    ).all()

    existing = db.exec(
        select(UserMemoryRecord).where(
            UserMemoryRecord.user_id == user_id,
            UserMemoryRecord.is_active == True,  # noqa: E712
        )
    ).all()

    # Resolve model and API key
    model_type = model or "deepseek"
    api_key = resolve_api_key(model_type)
    if not api_key:
        raise HTTPException(400, f"未配置 {model_type} API Key")

    created = generate_memories(
        user_id=user_id,
        movies=movies,
        existing_memories=existing,
        model_type=model_type,
        api_key=api_key,
        db=db,
    )

    return {
        "memories": [
            {
                "id": m.id,
                "text": m.memory_text,
                "type": m.memory_type,
                "confidence": m.confidence,
                "related_movies": json.loads(m.related_movies) if m.related_movies else [],
                "created_at": iso_utc(m.created_at),
            }
            for m in created
        ],
        "count": len(created),
    }


@router.delete("/memories")
async def clear_memories(
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_user_db),
):
    """Soft-delete all memories for the current user (set is_active=False)."""
    user_id = current_user["id"]
    memories = db.exec(
        select(UserMemoryRecord).where(
            UserMemoryRecord.user_id == user_id,
            UserMemoryRecord.is_active == True,  # noqa: E712
        )
    ).all()

    for m in memories:
        m.is_active = False
        db.add(m)
    db.commit()

    return {"cleared": len(memories)}


# ---------------------------------------------------------------------------
# Profile overview & rebuild
# ---------------------------------------------------------------------------

@router.get("/overview")
async def profile_overview(
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_user_db),
):
    """Get the current user's taste profile overview."""
    user_id = current_user["id"]

    profile = db.exec(
        select(UserProfileRecord).where(UserProfileRecord.user_id == user_id)
    ).first()

    movie_count = db.exec(
        select(func.count(MediaItemRecord.id)).where(
            MediaItemRecord.user_id == user_id,
            MediaItemRecord.status == "watched",
        )
    ).one()

    if not profile:
        return {
            "profile": None,
            "version": 0,
            "movie_count": movie_count or 0,
            "last_updated": None,
            "stats": {"avg_rating": 0, "top_genres": [], "preferred_decades": []},
        }

    # Parse profile data
    try:
        data = json.loads(profile.profile_json) if profile.profile_json else {}
    except (json.JSONDecodeError, TypeError):
        data = {}

    return {
        "profile": data,
        "version": profile.version or 0,
        "movie_count": movie_count or 0,
        "last_updated": iso_utc(profile.last_incremental_update) if profile.last_incremental_update else None,
        "stats": {
            "avg_rating": data.get("avg_rating", profile.avg_rating or 0),
            "top_genres": data.get("top_genres", []) or json.loads(profile.top_genres) if profile.top_genres else [],
            "preferred_decades": data.get("preferred_decades", []) or json.loads(profile.preferred_decades) if profile.preferred_decades else [],
        },
    }


@router.post("/rebuild")
async def rebuild_profile(
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_user_db),
):
    """Full profile rebuild — analyze all watched movies and generate taste profile."""
    import json
    import re
    from collections import Counter

    user_id = current_user["id"]

    movies = db.exec(
        select(MediaItemRecord).where(
            MediaItemRecord.user_id == user_id,
            MediaItemRecord.status == "watched",
        )
    ).all()

    if len(movies) < 3:
        raise HTTPException(400, "至少需要3部已看电影才能生成画像")

    ratings = [m.rating for m in movies if m.rating]
    avg_rating = sum(ratings) / len(ratings) if ratings else 0

    genre_counter = Counter()
    decade_counter = Counter()
    for m in movies:
        if m.genre:
            for g in re.split(r"\s*/\s*", m.genre):
                genre_counter[g.strip()] += 1
        if m.year:
            decade_counter[f"{(m.year // 10) * 10}s"] += 1

    top_genres = [g for g, _ in genre_counter.most_common(5)]
    preferred_decades = [d for d, _ in decade_counter.most_common(3)]

    profile = db.exec(
        select(UserProfileRecord).where(UserProfileRecord.user_id == user_id)
    ).first()

    profile_data = {
        "top_genres": top_genres,
        "avg_rating": round(avg_rating, 1),
        "total_movies": len(movies),
        "preferred_decades": preferred_decades,
    }

    if profile:
        profile.profile_json = json.dumps(profile_data, ensure_ascii=False)
        profile.version += 1
        profile.movie_count_analyzed = len(movies)
        profile.avg_rating = avg_rating
        profile.top_genres = json.dumps(top_genres, ensure_ascii=False)
        profile.preferred_decades = json.dumps(preferred_decades, ensure_ascii=False)
    else:
        profile = UserProfileRecord(
            user_id=user_id,
            profile_json=json.dumps(profile_data, ensure_ascii=False),
            movie_count_analyzed=len(movies),
            avg_rating=avg_rating,
            top_genres=json.dumps(top_genres, ensure_ascii=False),
            preferred_decades=json.dumps(preferred_decades, ensure_ascii=False),
        )
        db.add(profile)

    db.commit()

    return {
        "status": "ok",
        "version": profile.version,
        "movie_count": len(movies),
        "stats": {
            "avg_rating": round(avg_rating, 1),
            "top_genres": top_genres,
            "preferred_decades": preferred_decades,
        },
    }


@router.get("/preferences")
async def get_preferences(
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_user_db),
):
    """Get user preferences (RAG enabled, etc.)."""
    user_id = current_user["id"]
    prefs = db.exec(
        select(UserPreferencesRecord).where(UserPreferencesRecord.user_id == user_id)
    ).first()

    return {
        "rag_enabled": prefs.rag_enabled if prefs else True,
    }


@router.put("/preferences")
async def update_preferences(
    request: dict,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_user_db),
):
    """Update user preferences."""
    user_id = current_user["id"]
    prefs = db.exec(
        select(UserPreferencesRecord).where(UserPreferencesRecord.user_id == user_id)
    ).first()

    if not prefs:
        prefs = UserPreferencesRecord(user_id=user_id)

    if "rag_enabled" in request:
        prefs.rag_enabled = request["rag_enabled"]

    db.add(prefs)
    db.commit()

    return {"rag_enabled": prefs.rag_enabled}
