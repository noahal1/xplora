"""The single interface for per-user reads in the Xplora backend.

This module owns the recurring, per-user query shapes that routers used to
hand-roll with ``db.exec(select(...))`` / ``db.query(...)``.  Routers should
call these functions instead of importing ``models`` or ``select`` for routine
per-user reads (user preferences, profiles, memories, media lists, counts,
sessions and their recommendations, or the user table).

Each function accepts a SQLModel ``Session`` supplied by dependency injection
and routes it through :func:`crud._session.resolve_db`, so the same body also
works when called with ``db=None`` (in which case a short-lived session is
opened and closed here).  Writes stay in the routers/crud layer — this module
only reads.
"""

from typing import Optional

from sqlalchemy import func as sa_func
from sqlmodel import Session, select

from crud._session import resolve_db
from models import (
    MediaItemRecord,
    MovieEmbeddingRecord,
    RecommendationRecord,
    SessionRecord,
    UserMemoryRecord,
    UserPreferencesRecord,
    UserProfileRecord,
    UserRecord,
)


# ── Per-user records ───────────────────────────────────────────────


def get_preferences(user_id: int, db: Optional[Session] = None) -> UserPreferencesRecord | None:
    """Return this user's preferences row, or None if none exists."""
    session, close_db = resolve_db(db)
    try:
        return session.exec(
            select(UserPreferencesRecord).where(UserPreferencesRecord.user_id == user_id)
        ).first()
    finally:
        if close_db:
            session.close()


def get_profile(user_id: int, db: Optional[Session] = None) -> UserProfileRecord | None:
    """Return this user's taste-profile row, or None if none exists."""
    session, close_db = resolve_db(db)
    try:
        return session.exec(
            select(UserProfileRecord).where(UserProfileRecord.user_id == user_id)
        ).first()
    finally:
        if close_db:
            session.close()


def get_memories(
    user_id: int,
    db: Optional[Session] = None,
    active_only: bool = True,
    limit: Optional[int] = None,
    newest_first: bool = False,
) -> list[UserMemoryRecord]:
    """Return the user's taste memories.

    By default only active memories (``is_active == True``) are returned, in
    natural order.  ``active_only=False`` includes soft-deleted rows, and
    ``newest_first=True`` orders by ``created_at`` descending.  ``limit`` caps
    the result when given.
    """
    session, close_db = resolve_db(db)
    try:
        stmt = select(UserMemoryRecord).where(UserMemoryRecord.user_id == user_id)
        if active_only:
            stmt = stmt.where(UserMemoryRecord.is_active == True)  # noqa: E712
        if newest_first:
            stmt = stmt.order_by(UserMemoryRecord.created_at.desc())
        if limit is not None:
            stmt = stmt.limit(limit)
        return session.exec(stmt).all()
    finally:
        if close_db:
            session.close()


# ── Counts ─────────────────────────────────────────────────────────


def count_media(user_id: int, db: Optional[Session] = None, status: Optional[str] = None) -> int:
    """Count the user's media items, optionally restricted to one status."""
    session, close_db = resolve_db(db)
    try:
        stmt = select(sa_func.count(MediaItemRecord.id)).where(MediaItemRecord.user_id == user_id)
        if status is not None:
            stmt = stmt.where(MediaItemRecord.status == status)
        return session.exec(stmt).one()
    finally:
        if close_db:
            session.close()


def count_embedded(user_id: int, db: Optional[Session] = None) -> int:
    """Count the user's stored movie embeddings."""
    session, close_db = resolve_db(db)
    try:
        return session.exec(
            select(sa_func.count(MovieEmbeddingRecord.id)).where(
                MovieEmbeddingRecord.user_id == user_id
            )
        ).one()
    finally:
        if close_db:
            session.close()


# ── Media lists ────────────────────────────────────────────────────


def list_all_media(
    user_id: int, db: Optional[Session] = None, status: Optional[str] = None
) -> list[MediaItemRecord]:
    """Return all of the user's media items, optionally filtered by status."""
    session, close_db = resolve_db(db)
    try:
        stmt = select(MediaItemRecord).where(MediaItemRecord.user_id == user_id)
        if status is not None:
            stmt = stmt.where(MediaItemRecord.status == status)
        return session.exec(stmt).all()
    finally:
        if close_db:
            session.close()


def get_media_by_ids(
    user_id: int, ids: list[int], db: Optional[Session] = None
) -> list[MediaItemRecord]:
    """Return the user's media items whose primary keys are in ``ids``."""
    session, close_db = resolve_db(db)
    try:
        return session.exec(
            select(MediaItemRecord).where(
                MediaItemRecord.user_id == user_id,
                MediaItemRecord.id.in_(ids),  # type: ignore[attr-defined]
            )
        ).all()
    finally:
        if close_db:
            session.close()


def list_embeddings(user_id: int, db: Optional[Session] = None) -> list[MovieEmbeddingRecord]:
    """Return all stored movie embeddings for the user."""
    session, close_db = resolve_db(db)
    try:
        return session.exec(
            select(MovieEmbeddingRecord).where(MovieEmbeddingRecord.user_id == user_id)
        ).all()
    finally:
        if close_db:
            session.close()


# ── Sessions & recommendations ────────────────────────────────────


def list_sessions(user_id: int, db: Optional[Session] = None) -> list[SessionRecord]:
    """Return all recommendation sessions belonging to the user."""
    session, close_db = resolve_db(db)
    try:
        return session.exec(
            select(SessionRecord).where(SessionRecord.user_id == user_id)
        ).all()
    finally:
        if close_db:
            session.close()


def list_recommendations(
    session_id: int, db: Optional[Session] = None
) -> list[RecommendationRecord]:
    """Return all recommendation rows attached to one session."""
    session, close_db = resolve_db(db)
    try:
        return session.exec(
            select(RecommendationRecord).where(
                RecommendationRecord.session_id == session_id
            )
        ).all()
    finally:
        if close_db:
            session.close()


# ── Users ──────────────────────────────────────────────────────────


def list_users(db: Optional[Session] = None) -> list[UserRecord]:
    """Return every user row."""
    session, close_db = resolve_db(db)
    try:
        return session.exec(select(UserRecord)).all()
    finally:
        if close_db:
            session.close()


def get_user_by_username(
    db: Optional[Session], username: str
) -> UserRecord | None:
    """Return the user with this username, or None."""
    session, close_db = resolve_db(db)
    try:
        return session.exec(
            select(UserRecord).where(UserRecord.username == username)
        ).first()
    finally:
        if close_db:
            session.close()
