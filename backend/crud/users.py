"""User authentication CRUD operations."""

from datetime import datetime, timezone
from typing import Optional

from passlib.hash import bcrypt
from sqlmodel import select

from database import get_session
from models import UserRecord


def create_user(username: str, password: str, is_admin: bool = False) -> UserRecord:
    """Create a new user. Raises ValueError if username already exists."""
    db = get_session()
    try:
        existing = db.exec(
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
        db.add(user)
        db.commit()
        db.refresh(user)
        return user
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def authenticate_user(username: str, password: str) -> Optional[UserRecord]:
    """Verify username/password. Returns UserRecord on success, None on failure."""
    db = get_session()
    try:
        user = db.exec(
            select(UserRecord).where(UserRecord.username == username)
        ).first()
        if not user:
            return None
        if not bcrypt.verify(password, user.password_hash):
            return None
        return user
    finally:
        db.close()


def get_user_by_id(user_id: int) -> Optional[UserRecord]:
    """Get a user by ID."""
    db = get_session()
    try:
        return db.exec(
            select(UserRecord).where(UserRecord.id == user_id)
        ).first()
    finally:
        db.close()


def change_password(user_id: int, old_password: str, new_password: str) -> bool:
    """Change a user's password. Returns True on success, False if old password is wrong."""
    db = get_session()
    try:
        user = db.exec(
            select(UserRecord).where(UserRecord.id == user_id)
        ).first()
        if not user:
            return False
        if not bcrypt.verify(old_password, user.password_hash):
            return False
        user.password_hash = bcrypt.hash(new_password)
        db.commit()
        return True
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def list_users() -> list[UserRecord]:
    """List all users (admin panel)."""
    db = get_session()
    try:
        results = db.exec(
            select(UserRecord).order_by(UserRecord.created_at.desc())
        ).all()
        return list(results)
    finally:
        db.close()


def admin_delete_user(target_user_id: int) -> bool:
    """Admin: delete a user (cannot delete self). Returns True if deleted."""
    db = get_session()
    try:
        user = db.exec(
            select(UserRecord).where(UserRecord.id == target_user_id)
        ).first()
        if not user:
            return False
        db.delete(user)
        db.commit()
        return True
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def admin_reset_user_password(target_user_id: int, new_password: str) -> bool:
    """Admin: reset a user's password. Returns True if successful."""
    db = get_session()
    try:
        user = db.exec(
            select(UserRecord).where(UserRecord.id == target_user_id)
        ).first()
        if not user:
            return False
        user.password_hash = bcrypt.hash(new_password)
        db.commit()
        return True
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()
