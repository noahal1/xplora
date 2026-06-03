"""Operation / audit log CRUD operations."""

from datetime import datetime, timezone
import logging
from typing import Optional

from sqlalchemy import func as sa_func
from sqlmodel import select

from database import get_session
from models import OperationLogRecord

logger = logging.getLogger(__name__)


def log_operation(user_id: int, username: str, action: str, detail: Optional[str] = None):
    """Record an operation in the audit log."""
    db = get_session()
    try:
        record = OperationLogRecord(
            user_id=user_id,
            username=username,
            action=action,
            detail=detail,
            created_at=datetime.now(timezone.utc),
        )
        db.add(record)
        db.commit()
    except Exception as e:
        db.rollback()
        logger.warning("Failed to write operation log (action=%s): %s", action, e)
    finally:
        db.close()


def get_operation_logs(
    user_id: Optional[int] = None,
    action: Optional[str] = None,
    page: int = 0,
    page_size: int = 50,
) -> tuple[list[OperationLogRecord], int]:
    """Query operation logs with optional filters."""
    db = get_session()
    try:
        query = select(OperationLogRecord)
        if user_id is not None:
            query = query.where(OperationLogRecord.user_id == user_id)
        if action:
            query = query.where(OperationLogRecord.action == action)

        total = db.scalar(
            select(sa_func.count()).select_from(query.subquery())
        ) or 0

        records = list(
            db.exec(
                query.order_by(OperationLogRecord.created_at.desc())
                .offset(page * page_size)
                .limit(page_size)
            ).all()
        )
        return records, total
    finally:
        db.close()
