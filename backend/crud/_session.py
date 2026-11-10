"""Shared session resolution for the crud package."""

from typing import Optional

from sqlmodel import Session

from database import get_session


def resolve_db(db: Optional[Session] = None) -> tuple[Session, bool]:
    """Return a session and whether it needs to be closed."""
    if db is not None:
        return db, False
    return get_session(), True
