"""User authentication CRUD operations."""

from datetime import datetime, timezone
from typing import Optional

from passlib.hash import bcrypt
from sqlmodel import Session, select

from database import get_session
from models import UserRecord


def _resolve_db(db: Optional[Session] = None) -> tuple[Session, bool]:
    """Return a session and whether it needs to be closed."""
    if db is not None:
        return db, False
    return get_session(), True


def create_user(username: str, password: str, is_admin: bool = False, db: Optional[Session] = None) -> UserRecord:
    """Create a new user. Raises ValueError if username already exists."""
    session, close_db = _resolve_db(db)
    try:
        existing = session.exec(
            select(UserRecord).where(UserRecord.username == username)
        ).first()
        if existing:
            raise ValueError(f"User '{username}' already exists")
        user = UserRecord(
            username=username,
            password_hash=bcrypt.hash(password),
            is_admin=is_admin,
            created_at=datetime.now(timezone.utc),
        )
        session.add(user)
        session.commit()
        session.refresh(user)
        return user
    except Exception:
        session.rollback()
        raise
    finally:
        if close_db:
            session.close()


def authenticate_user(username: str, password: str, db: Optional[Session] = None) -> Optional[UserRecord]:
    """Verify username/password. Returns UserRecord on success, None on failure."""
    session, close_db = _resolve_db(db)
    try:
        user = session.exec(
            select(UserRecord).where(UserRecord.username == username)
        ).first()
        if not user:
            return None
        if not bcrypt.verify(password, user.password_hash):
            return None
        return user
    finally:
        if close_db:
            session.close()


def get_user_by_id(user_id: int, db: Optional[Session] = None) -> Optional[UserRecord]:
    """Get a user by ID."""
    session, close_db = _resolve_db(db)
    try:
        return session.exec(
            select(UserRecord).where(UserRecord.id == user_id)
        ).first()
    finally:
        if close_db:
            session.close()


def change_password(user_id: int, old_password: str, new_password: str, db: Optional[Session] = None) -> bool:
    """Change a user's password. Returns True on success, False if old password is wrong."""
    session, close_db = _resolve_db(db)
    try:
        user = session.exec(
            select(UserRecord).where(UserRecord.id == user_id)
        ).first()
        if not user:
            return False
        if not bcrypt.verify(old_password, user.password_hash):
            return False
        user.password_hash = bcrypt.hash(new_password)
        session.commit()
        return True
    except Exception:
        session.rollback()
        raise
    finally:
        if close_db:
            session.close()


def list_users(db: Optional[Session] = None) -> list[UserRecord]:
    """List all users (admin panel)."""
    session, close_db = _resolve_db(db)
    try:
        results = session.exec(
            select(UserRecord).order_by(UserRecord.created_at.desc())
        ).all()
        return list(results)
    finally:
        if close_db:
            session.close()


def admin_delete_user(target_user_id: int, db: Optional[Session] = None) -> bool:
    """Admin: delete a user (cannot delete self). Returns True if deleted."""
    session, close_db = _resolve_db(db)
    try:
        user = session.exec(
            select(UserRecord).where(UserRecord.id == target_user_id)
        ).first()
        if not user:
            return False
        session.delete(user)
        session.commit()
        return True
    except Exception:
        session.rollback()
        raise
    finally:
        if close_db:
            session.close()


def admin_reset_user_password(target_user_id: int, new_password: str, db: Optional[Session] = None) -> bool:
    """Admin: reset a user's password. Returns True if successful."""
    session, close_db = _resolve_db(db)
    try:
        user = session.exec(
            select(UserRecord).where(UserRecord.id == target_user_id)
        ).first()
        if not user:
            return False
        user.password_hash = bcrypt.hash(new_password)
        session.commit()
        return True
    except Exception:
        session.rollback()
        raise
    finally:
        if close_db:
            session.close()
