"""CRUD operations for media server records."""

from datetime import datetime, timezone
from typing import Optional

from sqlmodel import Session, select

from models.db import MediaServerRecord


def create_media_server(
    user_id: int,
    name: str,
    server_type: str,
    host: str,
    port: int,
    api_key: str,
    use_ssl: bool = False,
    *,
    db: Session,
) -> MediaServerRecord:
    """Create a new media server record for the given user."""
    record = MediaServerRecord(
        user_id=user_id,
        name=name,
        server_type=server_type,
        host=host,
        port=port,
        api_key=api_key,
        use_ssl=use_ssl,
        is_active=True,
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return record


def get_media_servers(user_id: int, *, db: Session) -> list[MediaServerRecord]:
    """List all media servers for the given user."""
    return db.exec(
        select(MediaServerRecord)
        .where(MediaServerRecord.user_id == user_id)
        .order_by(MediaServerRecord.created_at.desc())
    ).all()


def get_media_server(server_id: int, user_id: int, *, db: Session) -> Optional[MediaServerRecord]:
    """Get a single media server by ID (scoped to user)."""
    return db.exec(
        select(MediaServerRecord).where(
            MediaServerRecord.id == server_id,
            MediaServerRecord.user_id == user_id,
        )
    ).first()


def update_media_server(
    server_id: int,
    user_id: int,
    *,
    db: Session,
    name: Optional[str] = None,
    host: Optional[str] = None,
    port: Optional[int] = None,
    api_key: Optional[str] = None,
    use_ssl: Optional[bool] = None,
    is_active: Optional[bool] = None,
) -> Optional[MediaServerRecord]:
    """Update a media server record. Returns None if not found."""
    record = get_media_server(server_id, user_id, db=db)
    if not record:
        return None

    if name is not None:
        record.name = name
    if host is not None:
        record.host = host
    if port is not None:
        record.port = port
    if api_key is not None:
        record.api_key = api_key
    if use_ssl is not None:
        record.use_ssl = use_ssl
    if is_active is not None:
        record.is_active = is_active

    db.add(record)
    db.commit()
    db.refresh(record)
    return record


def update_last_connected(server_id: int, user_id: int, *, db: Session) -> None:
    """Update the ``last_connected`` timestamp."""
    record = get_media_server(server_id, user_id, db=db)
    if record:
        record.last_connected = datetime.now(timezone.utc)
        db.add(record)
        db.commit()


def delete_media_server(server_id: int, user_id: int, *, db: Session) -> bool:
    """Delete a media server record. Returns True if deleted."""
    record = get_media_server(server_id, user_id, db=db)
    if not record:
        return False
    db.delete(record)
    db.commit()
    return True
