"""CRUD operations for MoviePilot connection records."""

from datetime import datetime, timezone
from typing import Optional

from sqlmodel import Session, select

from models.db import MoviePilotRecord


def create_mp_connection(
    user_id: int,
    host: str,
    port: int,
    api_token: str,
    name: str = "MoviePilot",
    use_ssl: bool = False,
    *,
    db: Session,
) -> MoviePilotRecord:
    """Create a new MoviePilot connection for the given user.

    If a connection already exists for this user, updates it instead.
    """
    existing = get_mp_connection(user_id, db=db)
    if existing:
        return update_mp_connection(
            user_id,
            db=db,
            name=name,
            host=host,
            port=port,
            api_token=api_token,
            use_ssl=use_ssl,
        )

    record = MoviePilotRecord(
        user_id=user_id,
        name=name,
        host=host,
        port=port,
        api_token=api_token,
        use_ssl=use_ssl,
        is_active=True,
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return record


def get_mp_connection(user_id: int, *, db: Session) -> Optional[MoviePilotRecord]:
    """Get the MoviePilot connection for the given user (single record per user)."""
    return db.exec(
        select(MoviePilotRecord).where(MoviePilotRecord.user_id == user_id)
    ).first()


def update_mp_connection(
    user_id: int,
    *,
    db: Session,
    name: Optional[str] = None,
    host: Optional[str] = None,
    port: Optional[int] = None,
    api_token: Optional[str] = None,
    use_ssl: Optional[bool] = None,
    is_active: Optional[bool] = None,
) -> Optional[MoviePilotRecord]:
    """Update a MoviePilot connection. Returns None if not found."""
    record = get_mp_connection(user_id, db=db)
    if not record:
        return None

    if name is not None:
        record.name = name
    if host is not None:
        record.host = host
    if port is not None:
        record.port = port
    if api_token is not None:
        record.api_token = api_token
    if use_ssl is not None:
        record.use_ssl = use_ssl
    if is_active is not None:
        record.is_active = is_active

    db.add(record)
    db.commit()
    db.refresh(record)
    return record


def update_mp_last_connected(user_id: int, *, db: Session) -> None:
    """Update the ``last_connected`` timestamp."""
    record = get_mp_connection(user_id, db=db)
    if record:
        record.last_connected = datetime.now(timezone.utc)
        db.add(record)
        db.commit()


def delete_mp_connection(user_id: int, *, db: Session) -> bool:
    """Delete the MoviePilot connection for the given user. Returns True if deleted."""
    record = get_mp_connection(user_id, db=db)
    if not record:
        return False
    db.delete(record)
    db.commit()
    return True
