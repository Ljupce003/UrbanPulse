import logging
from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from backend.core.config import get_supabase_admin
from backend.models.auth import UserRole

log = logging.getLogger("urbanpulse.auth")
bearer_scheme = HTTPBearer()


def _verify_token(token: str) -> dict:
    supabase = get_supabase_admin()
    try:
        resp = supabase.auth.get_user(token)
        if resp is None or resp.user is None:
            raise HTTPException(status_code=401, detail="Invalid or expired token")
        return resp.user
    except Exception as exc:
        log.warning(f"Token verification failed: {exc}")
        raise HTTPException(status_code=401, detail="Invalid or expired token")


async def get_current_user(
        credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
) -> dict:
    supabase_user = _verify_token(credentials.credentials)
    user_id = supabase_user.id

    supabase = get_supabase_admin()
    result = (
        supabase.table("user_profiles")
        .select("id, email, full_name, avatar_url, role")
        .eq("id", user_id)
        .maybe_single()
        .execute()
    )

    if not result.data:
        log.warning(f"No profile found for user_id={user_id}")
        raise HTTPException(status_code=403, detail="Profile not found. Please sign in again.")

    log.debug(f"Authenticated: {result.data['email']}  role={result.data['role']}")
    return result.data


def require_role(*allowed_roles: UserRole):
    allowed_values = {r.value for r in allowed_roles}

    async def guard(current_user: dict = Depends(get_current_user)):
        if current_user["role"] not in allowed_values:
            raise HTTPException(
                status_code=403,
                detail=f"Required role: {sorted(allowed_values)}",
            )
        return current_user

    return guard


require_analyst = require_role(UserRole.analyst, UserRole.admin)
require_admin = require_role(UserRole.admin)
