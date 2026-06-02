"""Recommendation session management endpoints."""

from fastapi import APIRouter, Depends, HTTPException

from auth import get_current_user
from crud import (
    get_sessions as db_get_sessions,
    get_session_detail as db_get_session_detail,
    delete_session as db_delete_session,
)

router = APIRouter(prefix="/api/sessions", tags=["sessions"])


@router.get("")
async def list_sessions(
    page: int = 0,
    page_size: int = 20,
    current_user: dict = Depends(get_current_user),
):
    """List recommendation sessions for current user."""
    sessions, total = db_get_sessions(
        user_id=current_user["id"], page=page, page_size=page_size
    )
    return {
        "sessions": [
            {
                "id": s.id,
                "model": s.model,
                "source_count": s.source_count,
                "recommendation_count": len(s.recommendations),
                "created_at": s.created_at.isoformat(),
            }
            for s in sessions
        ],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@router.get("/{session_id}")
async def get_session(
    session_id: int,
    current_user: dict = Depends(get_current_user),
):
    """Get a single session with its recommendations (must belong to user)."""
    session = db_get_session_detail(session_id, current_user["id"])
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return {
        "id": session.id,
        "model": session.model,
        "source_count": session.source_count,
        "created_at": session.created_at.isoformat(),
        "recommendations": [
            {
                "id": r.id,
                "title": r.title,
                "year": r.year,
                "genre": r.genre,
                "reason": r.reason,
                "confidence": r.confidence,
            }
            for r in session.recommendations
        ],
    }


@router.delete("/{session_id}")
async def delete_session(
    session_id: int,
    current_user: dict = Depends(get_current_user),
):
    """Delete a session (must belong to current user)."""
    deleted = db_delete_session(session_id, current_user["id"])
    if not deleted:
        raise HTTPException(status_code=404, detail="Session not found")
    return {"status": "deleted"}
