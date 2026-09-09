"""JWT authentication helpers and FastAPI dependencies."""

import logging
import os
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError, jwt

from crud import get_user_by_id

logger = logging.getLogger(__name__)

# JWT config
JWT_ALGORITHM = "HS256"
JWT_EXPIRY_HOURS = 24

# Where an auto-generated secret is persisted so tokens survive restarts.
# Shares the persistent volume with config.json (./data:/app/data in Docker).
_DATA_DIR = os.getenv(
    "XPLORA_DATA_DIR",
    os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data"),
)
JWT_SECRET_FILE = os.getenv(
    "XPLORA_JWT_SECRET_FILE", os.path.join(_DATA_DIR, "jwt_secret")
)

# The hardcoded default shipped by older versions (and still present in some
# .env files).  If it's still configured, treat it as unset so a real secret
# is generated instead of silently running with a publicly-known key.
_LEGACY_DEFAULT_SECRET = "xplora-dev-secret-change-in-production"


def _load_or_create_jwt_secret() -> str:
    """Resolve the JWT signing secret.

    Priority:
      1. ``JWT_SECRET`` env var — explicit, recommended for production
      2. Persisted secret file (``data/jwt_secret``) — survives restarts
      3. Freshly generated random secret, persisted to the file

    There is deliberately **no hardcoded default**: a public default would
    let anyone forge tokens for arbitrary users (including admins).  A
    generated secret is written to disk so existing sessions stay valid
    across restarts.
    """
    env_secret = os.getenv("JWT_SECRET")
    if env_secret and env_secret != _LEGACY_DEFAULT_SECRET:
        return env_secret
    if env_secret:
        logger.warning(
            "JWT_SECRET is set to the known legacy default value — ignoring it and "
            "generating a secure random secret instead (persisted to %s).",
            JWT_SECRET_FILE,
        )

    try:
        if os.path.exists(JWT_SECRET_FILE):
            with open(JWT_SECRET_FILE, "r", encoding="utf-8") as f:
                stored = f.read().strip()
            if stored:
                logger.info("JWT_SECRET loaded from %s", JWT_SECRET_FILE)
                return stored
    except OSError:
        pass

    generated = secrets.token_urlsafe(64)
    try:
        os.makedirs(os.path.dirname(JWT_SECRET_FILE) or ".", exist_ok=True)
        with open(JWT_SECRET_FILE, "w", encoding="utf-8") as f:
            f.write(generated)
        try:
            os.chmod(JWT_SECRET_FILE, 0o600)
        except OSError:
            pass  # Windows / filesystems without POSIX permissions
        logger.warning(
            "JWT_SECRET not configured — generated a random secret and saved it to %s. "
            "Set the JWT_SECRET env var to keep it stable across container rebuilds.",
            JWT_SECRET_FILE,
        )
    except OSError as e:
        logger.warning(
            "JWT_SECRET not configured and could not persist a generated secret to %s "
            "(%s) — tokens will be invalidated on restart.",
            JWT_SECRET_FILE, e,
        )
    return generated


JWT_SECRET = _load_or_create_jwt_secret()

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


def _decode_token(credentials: HTTPAuthorizationCredentials) -> dict:
    """Decode and validate the bearer token, returning the user info dict."""
    if credentials is None:
        raise HTTPException(status_code=401, detail="请先登录")
    token = credentials.credentials
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user_id = int(payload.get("sub"))
        # Verify user still exists (and surface the current password flag)
        user = get_user_by_id(user_id)
        if not user:
            raise HTTPException(status_code=401, detail="用户不存在")
        return {
            "id": user_id,
            "username": payload.get("username", ""),
            "is_admin": payload.get("admin", False),
            "must_change_password": bool(user.must_change_password),
        }
    except JWTError:
        raise HTTPException(status_code=401, detail="登录已过期，请重新登录")


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> dict:
    """Dependency: extract and validate JWT token, return user info dict.

    Accounts that still need to change their initial/default password are
    locked out of every protected endpoint (HTTP 403) until they do — see
    ``get_current_user_relaxed`` for the only endpoints that bypass this.
    """
    current_user = _decode_token(credentials)
    if current_user.get("must_change_password"):
        raise HTTPException(status_code=403, detail="请先修改初始密码后再使用")
    return current_user


def get_current_user_relaxed(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> dict:
    """Like ``get_current_user`` but does NOT block password-change flows.

    Used only by endpoints that must work while ``must_change_password`` is
    set: ``GET /api/auth/me`` and ``PUT /api/auth/password``.
    """
    return _decode_token(credentials)


def require_admin(current_user: dict = Depends(get_current_user)) -> dict:
    """Dependency: ensure current user is admin."""
    if not current_user["is_admin"]:
        raise HTTPException(status_code=403, detail="需要管理员权限")
    return current_user
