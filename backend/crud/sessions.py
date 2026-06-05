"""Recommendation session CRUD operations."""

from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import func as sa_func
from sqlmodel import select

from database import get_session
from models import SessionRecord, RecommendationRecord, MediaRating, MediaRecommendation


def save_session(
    model: str,
    source_count: int,
    movies: list[MediaRating],
    recommendations: list[MediaRecommendation],
    user_id: int,
) -> SessionRecord:
    """Create a recommendation session for a user.

    Note: ``movies`` is kept for API compatibility but is not persisted.
    Only the recommendation results are stored.
    """
    db = get_session()
    try:
        session = SessionRecord(
            model=model,
            source_count=source_count,
            user_id=user_id,
            created_at=datetime.now(timezone.utc),
        )
        db.add(session)
        db.flush()

        now = datetime.now(timezone.utc)
        for rec in recommendations:
            rec_record = RecommendationRecord(
                title=rec.title,
                year=rec.year,
                genre=rec.genre,
                reason=rec.reason,
                confidence=rec.confidence,
                session_id=session.id,
                created_at=now,
            )
            db.add(rec_record)

        db.commit()
        db.refresh(session)
        return session
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def get_sessions(
    user_id: int, page: int = 0, page_size: int = 20
) -> tuple[list[SessionRecord], int]:
    """List sessions for a user with pagination."""
    db = get_session()
    try:
        base = select(SessionRecord).where(SessionRecord.user_id == user_id)
        total = db.scalar(
            select(sa_func.count()).select_from(base.subquery())
        ) or 0
        sessions = list(
            db.exec(
                base.order_by(SessionRecord.created_at.desc())
                .offset(page * page_size)
                .limit(page_size)
            ).all()
        )
        return sessions, total
    finally:
        db.close()


def get_session_detail(session_id: int, user_id: int) -> Optional[SessionRecord]:
    """Get a single session (must belong to user)."""
    db = get_session()
    try:
        return db.exec(
            select(SessionRecord).where(
                SessionRecord.id == session_id,
                SessionRecord.user_id == user_id,
            )
        ).first()
    finally:
        db.close()


def delete_session(session_id: int, user_id: int) -> bool:
    """Delete a session (must belong to user)."""
    db = get_session()
    try:
        session = db.exec(
            select(SessionRecord).where(
                SessionRecord.id == session_id,
                SessionRecord.user_id == user_id,
            )
        ).first()
        if not session:
            return False
        db.delete(session)
        db.commit()
        return True
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()
