import logging
from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from backend.core.dependencies import get_current_user, require_admin
from backend.models.auth import UserProfile, RoleUpdateRequest, RoleUpdateResponse
from backend.services.auth_service import verify_and_upsert_session, change_user_role, list_all_users, \
    delete_user_account

log = logging.getLogger("urbanpulse.auth")
router = APIRouter(prefix="/api/auth", tags=["auth"])
bearer = HTTPBearer()


@router.post("/session", response_model=UserProfile)
async def verify_session(
        credentials: HTTPAuthorizationCredentials = Depends(bearer),
):
    return verify_and_upsert_session(credentials.credentials)


@router.get("/me", response_model=UserProfile)
async def get_me(current_user: dict = Depends(get_current_user)):
    return UserProfile(**current_user)


@router.get("/users", response_model=list[UserProfile])
async def get_all_users(_: dict = Depends(require_admin)):
    return list_all_users()


@router.patch("/users/{user_id}/role", response_model=RoleUpdateResponse)
async def update_role(
        user_id: str,
        body: RoleUpdateRequest,
        _: dict = Depends(require_admin),
):
    return change_user_role(user_id, body.role)


@router.delete("/users/{user_id}")
async def delete_user(user_id: str, _: dict = Depends(require_admin)):
    try:
        return delete_user_account(user_id)
    except Exception as e:
        log.error(f"Failed to delete user {user_id}: {e}")
        raise HTTPException(status_code=400, detail=str(e))
