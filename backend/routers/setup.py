"""First-run setup wizard endpoints.

Lets a freshly-deployed instance be initialized through a guided UI:
create the admin account (personalizing the seeded default admin) and
configure API keys. Once the seeded default admin is personalized
(``must_change_password`` cleared) setup is considered complete and the
public endpoints stop accepting requests.
"""

import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from passlib.hash import bcrypt
from pydantic import BaseModel
from sqlmodel import Session, select

from auth import create_token
from config_manager import (
    API_KEY_NAMES,
    get_all_status as get_config_status,
    set_api_key,
)
from crud import log_operation
from database import get_db
from models import UserRecord

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/setup", tags=["setup"])


class SetupRequest(BaseModel):
    username: str
    password: str
    api_keys: dict[str, str] = {}


def _find_setup_target(db: Session) -> UserRecord | None:
    """Return the account to personalize during setup.

    Prefers the seeded default admin (still flagged ``must_change_password``).
    Returns ``None`` when no setup target exists (e.g. already configured) or
    the instance has no users yet (handled by the caller).
    """
    users = db.exec(select(UserRecord)).all()
    if not users:
        return None  # empty instance -> create a brand new admin
    return next((u for u in users if u.must_change_password), None)


@router.get("/status")
async def setup_status(db: Session = Depends(get_db)):
    """Public: report whether the instance still needs first-run setup."""
    return {
        "needs_setup": _find_setup_target(db) is not None,
        "api_keys_configured": any(get_config_status().values()),
    }


@router.post("")
async def run_setup(req: SetupRequest, request: Request, db: Session = Depends(get_db)):
    """Public (first-run only): create the admin account and save API keys.

    Idempotency: only valid while a setup target exists. After the seeded
    default admin is personalized this endpoint refuses further calls.
    """
    target = _find_setup_target(db)
    # No pending target but users already exist -> already configured.
    if target is None and db.exec(select(UserRecord)).first() is not None:
        raise HTTPException(status_code=400, detail="实例已完成初始化，无法重复设置")

    username = (req.username or "").strip()
    password = req.password or ""
    if not username:
        raise HTTPException(status_code=400, detail="用户名不能为空")
    if len(password) < 8:
        raise HTTPException(status_code=400, detail="密码长度不能少于8位")

    if target is None:
        # Brand-new instance with no users: create the first admin.
        if db.exec(select(UserRecord).where(UserRecord.username == username)).first():
            raise HTTPException(status_code=409, detail=f"用户 '{username}' 已存在")
        user = UserRecord(
            username=username,
            password_hash=bcrypt.hash(password),
            is_admin=True,
            created_at=datetime.now(timezone.utc),
        )
        db.add(user)
        db.commit()
        db.refresh(user)
    else:
        # Personalize the seeded default admin account.
        if username != target.username:
            clash = db.exec(
                select(UserRecord).where(UserRecord.username == username)
            ).first()
            if clash and clash.id != target.id:
                raise HTTPException(status_code=409, detail=f"用户 '{username}' 已存在")
        target.username = username
        target.password_hash = bcrypt.hash(password)
        target.must_change_password = False
        db.add(target)
        db.commit()
        db.refresh(target)
        user = target

    # Save any provided API keys (config.json > env; empty values skipped).
    api_keys = req.api_keys if isinstance(req.api_keys, dict) else {}
    for key_name in API_KEY_NAMES:
        value = api_keys.get(key_name)
        if value and value.strip():
            try:
                set_api_key(key_name, value.strip())
            except ValueError:
                # Unknown key name — ignore safely.
                pass

    token = create_token(user.id, user.username, user.is_admin)
    log_operation(user.id, user.username, "setup", "完成首次初始化设置", db=db)
    return {
        "token": token,
        "username": user.username,
        "is_admin": user.is_admin,
    }
