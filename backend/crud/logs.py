"""Operation / audit log CRUD operations.

Operation logs are stored in the MASTER database (not per-user DBs)
so that admin users can query logs across all users.

Each call creates a fresh session to avoid thread-safety issues
with shared SQLAlchemy Session objects.
"""

from datetime import datetime, timezone
import logging
from typing import Optional

from sqlalchemy import func as sa_func
from sqlmodel import Session, select

from models import OperationLogRecord

logger = logging.getLogger(__name__)


def _get_master_session() -> Session:
    """Create a fresh master DB session for operation logs."""
    from database import master_engine
    return Session(master_engine)


def log_operation(
    user_id: int, username: str, action: str,
    detail: Optional[str] = None,
    db: Optional[Session] = None,
):
    """Record an operation in the audit log (always writes to master DB).

    The ``db`` parameter is accepted for backward compatibility but
    is **ignored** — logs always go to the master database.
    Each call creates its own session for thread safety.
    """
    session = _get_master_session()
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
        session.close()


def get_operation_logs(
    user_id: Optional[int] = None,
    action: Optional[str] = None,
    page: int = 0,
    page_size: int = 50,
    db: Optional[Session] = None,
) -> tuple[list[OperationLogRecord], int]:
    """Query operation logs with optional filters (always reads from master DB)."""
    session = _get_master_session()
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
        session.close()
