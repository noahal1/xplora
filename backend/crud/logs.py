"""Operation / audit log CRUD operations."""

from datetime import datetime, timezone
import logging
from typing import Optional

from sqlalchemy import func as sa_func
from sqlmodel import Session, select

from database import get_session
from models import OperationLogRecord

logger = logging.getLogger(__name__)


def _resolve_db(db: Optional[Session] = None) -> tuple[Session, bool]:
    """Return a session and whether it needs to be closed."""
    if db is not None:
        return db, False
    return get_session(), True


def log_operation(
    user_id: int, username: str, action: str,
    detail: Optional[str] = None,
    db: Optional[Session] = None,
):
    """Record an operation in the audit log."""
    session, close_db = _resolve_db(db)
    try:
        record = OperationLogRecord(
            user_id=user_id,
            username=username,
            action=action,
            detail=detail,
            created_at=datetime.now(timezone.utc),
        )
        session.add(record)
        session.commit()
    except Exception as e:
        session.rollback()
        logger.warning("Failed to write operation log (action=%s): %s", action, e)
    finally:
        if close_db:
            session.close()


def get_operation_logs(
    user_id: Optional[int] = None,
    action: Optional[str] = None,
    page: int = 0,
    page_size: int = 50,
    db: Optional[Session] = None,
) -> tuple[list[OperationLogRecord], int]:
    """Query operation logs with optional filters."""
    session, close_db = _resolve_db(db)
    try:
        query = select(OperationLogRecord)
        if user_id is not None:
            query = query.where(OperationLogRecord.user_id == user_id)
        if action:
            query = query.where(OperationLogRecord.action == action)

        total = session.scalar(
            select(sa_func.count()).select_from(query.subquery())
        ) or 0

        records = list(
            session.exec(
                query.order_by(OperationLogRecord.created_at.desc())
                .offset(page * page_size)
                .limit(page_size)
            ).all()
        )
        return records, total
    finally:
        if close_db:
            session.close()
