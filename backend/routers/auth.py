"""Authentication & user management endpoints."""

from fastapi import APIRouter, Depends, HTTPException

from auth import get_current_user, require_admin, create_token
from crud import (
    create_user,
    authenticate_user,
    list_users,
    admin_delete_user,
    admin_reset_user_password,
    change_password,
)
from models import (
    LoginRequest,
    LoginResponse,
    CreateUserRequest,
    UserInfo,
    ChangePasswordRequest,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/login", response_model=LoginResponse)
async def login(req: LoginRequest):
    """Login with username and password. Returns JWT token."""
    user = authenticate_user(req.username, req.password)
    if not user:
        raise HTTPException(status_code=401, detail="用户名或密码错误")
    token = create_token(user.id, user.username, user.is_admin)
    return LoginResponse(token=token, username=user.username, is_admin=user.is_admin)


@router.get("/me")
async def get_me(current_user: dict = Depends(get_current_user)):
    """Get current user info."""
    return current_user


@router.post("/users", response_model=UserInfo)
async def admin_create_user(
    req: CreateUserRequest,
    _admin: dict = Depends(require_admin),
):
    """Admin only: create a new user account."""
    try:
        user = create_user(req.username, req.password, is_admin=False)
        return UserInfo(
            id=user.id,
            username=user.username,
            is_admin=user.is_admin,
            created_at=user.created_at.isoformat(),
        )
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))


@router.get("/users")
async def admin_list_users(
    _admin: dict = Depends(require_admin),
):
    """Admin only: list all users."""
    users = list_users()
    return {
        "users": [
            UserInfo(
                id=u.id,
                username=u.username,
                is_admin=u.is_admin,
                created_at=u.created_at.isoformat(),
            )
            for u in users
        ]
    }


@router.delete("/users/{user_id}")
async def admin_delete_user_endpoint(
    user_id: int,
    admin: dict = Depends(require_admin),
):
    """Admin only: delete a user account."""
    if user_id == admin["id"]:
        raise HTTPException(status_code=400, detail="不能删除自己的账号")
    deleted = admin_delete_user(user_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="用户不存在")
    return {"status": "deleted"}


@router.post("/users/{user_id}/reset-password")
async def admin_reset_password_endpoint(
    user_id: int,
    req: dict,
    _admin: dict = Depends(require_admin),
):
    """Admin only: reset a user's password."""
    new_password = req.get("new_password", "")
    if len(new_password) < 4:
        raise HTTPException(status_code=400, detail="密码长度不能少于4位")
    success = admin_reset_user_password(user_id, new_password)
    if not success:
        raise HTTPException(status_code=404, detail="用户不存在")
    return {"status": "ok", "message": "密码已重置"}


@router.put("/password")
async def change_my_password(
    req: ChangePasswordRequest,
    current_user: dict = Depends(get_current_user),
):
    """Change the current user's password."""
    success = change_password(current_user["id"], req.old_password, req.new_password)
    if not success:
        raise HTTPException(status_code=400, detail="原密码错误")
    return {"status": "ok", "message": "密码已更新"}
