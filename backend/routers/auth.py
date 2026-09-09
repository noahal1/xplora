"""Authentication & user management endpoints."""

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlmodel import Session

from auth import get_current_user_relaxed, require_admin, create_token
from crud import (
    create_user,
    authenticate_user,
    list_users,
    admin_delete_user,
    admin_reset_user_password,
    change_password,
    log_operation,
)
from database import get_db, init_user_database, delete_user_database
from helpers import iso_utc
from ratelimit import client_ip, login_rate_limiter
from models import (
    LoginRequest,
    LoginResponse,
    CreateUserRequest,
    UserInfo,
    ChangePasswordRequest,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/login", response_model=LoginResponse)
async def login(req: LoginRequest, request: Request, db: Session = Depends(get_db)):
    """Login with username and password. Returns JWT token.

    Failed attempts are rate-limited per client IP to mitigate brute-force
    attacks (see ``ratelimit``).
    """
    ip = client_ip(request)
    allowed, retry_after = login_rate_limiter.check(ip)
    if not allowed:
        raise HTTPException(
            status_code=429,
            detail="尝试次数过多，请稍后再试",
            headers={"Retry-After": str(retry_after)},
        )
    user = authenticate_user(req.username, req.password, db=db)
    if not user:
        login_rate_limiter.record_failure(ip)
        raise HTTPException(status_code=401, detail="用户名或密码错误")
    login_rate_limiter.reset(ip)
    token = create_token(user.id, user.username, user.is_admin)
    log_operation(user.id, user.username, "login", "用户登录", db=db)
    return LoginResponse(
        token=token,
        username=user.username,
        is_admin=user.is_admin,
        must_change_password=user.must_change_password,
    )


@router.get("/me")
async def get_me(current_user: dict = Depends(get_current_user_relaxed)):
    """Get current user info (works even while a password change is pending)."""
    return current_user


@router.post("/users", response_model=UserInfo)
async def admin_create_user(
    req: CreateUserRequest,
    _admin: dict = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Admin only: create a new user account."""
    try:
        user = create_user(req.username, req.password, is_admin=False, db=db)
        try:
            # Create the user's personal database
            init_user_database(user.id, user.username)
        except Exception as e:
            # Rollback user creation if database creation fails
            admin_delete_user(user.id, db=db)
            raise HTTPException(status_code=500, detail=f"创建用户数据库失败: {str(e)}")
        log_operation(_admin["id"], _admin["username"], "admin_create_user", f"创建用户: {user.username}", db=db)
        return UserInfo(
            id=user.id,
            username=user.username,
            is_admin=user.is_admin,
            created_at=iso_utc(user.created_at),
        )
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))


@router.get("/users")
async def admin_list_users(
    _admin: dict = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Admin only: list all users."""
    users = list_users(db=db)
    return {
        "users": [
            UserInfo(
                id=u.id,
                username=u.username,
                is_admin=u.is_admin,
                created_at=iso_utc(u.created_at),
            )
            for u in users
        ]
    }


@router.delete("/users/{user_id}")
async def admin_delete_user_endpoint(
    user_id: int,
    admin: dict = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Admin only: delete a user account and their database."""
    if user_id == admin["id"]:
        raise HTTPException(status_code=400, detail="不能删除自己的账号")
    deleted = admin_delete_user(user_id, db=db)
    if not deleted:
        raise HTTPException(status_code=404, detail="用户不存在")
    # Delete the user's personal database
    delete_user_database(user_id)
    log_operation(admin["id"], admin["username"], "admin_delete_user", f"删除用户: {user_id}", db=db)
    return {"status": "deleted"}


@router.post("/users/{user_id}/reset-password")
async def admin_reset_password_endpoint(
    user_id: int,
    req: dict,
    _admin: dict = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Admin only: reset a user's password."""
    new_password = req.get("new_password", "")
    if len(new_password) < 8:
        raise HTTPException(status_code=400, detail="密码长度不能少于8位")
    success = admin_reset_user_password(user_id, new_password, db=db)
    if not success:
        raise HTTPException(status_code=404, detail="用户不存在")
    log_operation(_admin["id"], _admin["username"], "admin_reset_password", f"重置用户 {user_id} 密码", db=db)
    return {"status": "ok", "message": "密码已重置"}


@router.put("/password")
async def change_my_password(
    req: ChangePasswordRequest,
    current_user: dict = Depends(get_current_user_relaxed),
    db: Session = Depends(get_db),
):
    """Change the current user's password (allowed while a change is pending)."""
    try:
        success = change_password(current_user["id"], req.old_password, req.new_password, db=db)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if not success:
        raise HTTPException(status_code=400, detail="原密码错误")
    log_operation(current_user["id"], current_user["username"], "change_password", "修改密码", db=db)
    return {"status": "ok", "message": "密码已更新"}
