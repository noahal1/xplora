"""Recommendation session CRUD operations."""

from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import func as sa_func
from sqlalchemy.orm import selectinload
from sqlmodel import Session, select

from database import get_session
from models import SessionRecord, RecommendationRecord, MediaRating, MediaRecommendation


def _resolve_db(db: Optional[Session] = None) -> tuple[Session, bool]:
    """Return a session and whether it needs to be closed."""
    if db is not None:
        return db, False
    return get_session(), True


def save_session(
    model: str,
    source_count: int,
    movies: list[MediaRating],
    recommendations: list[MediaRecommendation],
    user_id: int,
    db: Optional[Session] = None,
) -> SessionRecord:
    """Create a recommendation session for a user.

    Note: ``movies`` is kept for API compatibility but is not persisted.
    Only the recommendation results are stored.
    """
    session, close_db = _resolve_db(db)
    try:
        sess = SessionRecord(
            model=model,
            source_count=source_count,
            user_id=user_id,
            created_at=datetime.now(timezone.utc),
        )
        session.add(sess)
        session.flush()

        now = datetime.now(timezone.utc)
        for rec in recommendations:
            rec_record = RecommendationRecord(
                title=rec.title,
                year=rec.year,
                genre=rec.genre,
                reason=rec.reason,
                confidence=rec.confidence,
                tmdb_id=rec.tmdb_id,
                media_type=rec.media_type,
                session_id=sess.id,
                created_at=now,
            )
            session.add(rec_record)

        session.commit()
        # Explicit refresh is intentionally omitted. After commit() the
        # instance is expired but the primary key (id) is already populated
        # by SQLite's lastrowid. Other attributes will be lazy-loaded on
        # first access while the session is still open.
        return sess
    except Exception:
        session.rollback()
        raise
    finally:
        if close_db:
            session.close()


def get_sessions(
    user_id: int, page: int = 0, page_size: int = 20,
    db: Optional[Session] = None,
) -> tuple[list[SessionRecord], int]:
    """List sessions for a user with pagination."""
    session, close_db = _resolve_db(db)
    try:
        base = select(SessionRecord).where(SessionRecord.user_id == user_id)
        total = session.scalar(
            select(sa_func.count()).select_from(base.subquery())
        ) or 0
        sessions = list(
            session.exec(
                base.options(selectinload(SessionRecord.recommendations))
                .order_by(SessionRecord.created_at.desc())
                .offset(page * page_size)
                .limit(page_size)
            ).all()
        )
        return sessions, total
    finally:
        if close_db:
            session.close()


def get_session_detail(session_id: int, user_id: int, db: Optional[Session] = None) -> Optional[SessionRecord]:
    """Get a single session (must belong to user)."""
    session, close_db = _resolve_db(db)
    try:
        return session.exec(
            select(SessionRecord)
            .options(selectinload(SessionRecord.recommendations))
            .where(
                SessionRecord.id == session_id,
                SessionRecord.user_id == user_id,
            )
        ).first()
    finally:
        if close_db:
            session.close()


def delete_session(session_id: int, user_id: int, db: Optional[Session] = None) -> bool:
    """Delete a session (must belong to user)."""
    session, close_db = _resolve_db(db)
    try:
        sess = session.exec(
            select(SessionRecord).where(
                SessionRecord.id == session_id,
                SessionRecord.user_id == user_id,
            )
        ).first()
        if not sess:
            return False
        session.delete(sess)
        session.commit()
        return True
    except Exception:
        session.rollback()
        raise
    finally:
        if close_db:
            session.close()
