"""JWT authentication helpers and FastAPI dependencies."""

import os
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError, jwt

from crud import get_user_by_id

# JWT config
JWT_SECRET = os.getenv("JWT_SECRET", "xplore-dev-secret-change-in-production")
JWT_ALGORITHM = "HS256"
JWT_EXPIRY_HOURS = 24

security = HTTPBearer(auto_error=False)


def create_token(user_id: int, username: str, is_admin: bool) -> str:
    """Create a JWT token for the given user."""
    expiry = datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRY_HOURS)
    payload = {
        "sub": str(user_id),
        "username": username,
        "admin": is_admin,
        "exp": expiry,
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> dict:
    """Dependency: extract and validate JWT token, return user info dict."""
    if credentials is None:
        raise HTTPException(status_code=401, detail="请先登录")
    token = credentials.credentials
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user_id = int(payload.get("sub"))
        username = payload.get("username", "")
        is_admin = payload.get("admin", False)
        # Verify user still exists
        user = get_user_by_id(user_id)
        if not user:
            raise HTTPException(status_code=401, detail="用户不存在")
        return {"id": user_id, "username": username, "is_admin": is_admin}
    except JWTError:
        raise HTTPException(status_code=401, detail="登录已过期，请重新登录")


def require_admin(current_user: dict = Depends(get_current_user)) -> dict:
    """Dependency: ensure current user is admin."""
    if not current_user["is_admin"]:
        raise HTTPException(status_code=403, detail="需要管理员权限")
    return current_user
