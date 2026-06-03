"""Operation logs endpoints — admin only."""

from typing import Optional

from fastapi import APIRouter, Depends, Query

from auth import require_admin
from crud import get_operation_logs

router = APIRouter(prefix="/api/logs", tags=["logs"])


@router.get("")
async def list_logs(
    user_id: Optional[int] = Query(None, description="Filter by user ID"),
    action: Optional[str] = Query(None, description="Filter by action type"),
    page: int = Query(0, ge=0, description="Page number"),
    page_size: int = Query(50, ge=1, le=200, description="Items per page"),
    _admin: dict = Depends(require_admin),
):
    """Admin only: list operation logs with optional filters."""
    records, total = get_operation_logs(
        user_id=user_id,
        action=action,
        page=page,
        page_size=page_size,
    )
    return {
        "logs": [
            {
                "id": r.id,
                "user_id": r.user_id,
                "username": r.username,
                "action": r.action,
                "detail": r.detail,
                "created_at": r.created_at.isoformat(),
            }
            for r in records
        ],
        "total": total,
        "page": page,
        "page_size": page_size,
    }
