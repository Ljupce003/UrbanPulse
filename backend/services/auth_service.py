import logging
from fastapi import HTTPException
from backend.core.config import get_supabase_admin
from backend.models.auth import UserProfile, UserRole

log = logging.getLogger("urbanpulse.auth")


def verify_and_upsert_session(token: str) -> UserProfile:
    supabase = get_supabase_admin()

    try:
        resp = supabase.auth.get_user(token)
        if resp is None or resp.user is None:
            raise HTTPException(status_code=401, detail="Invalid token")
        sb_user = resp.user
    except HTTPException:
        raise
    except Exception as exc:
        log.warning(f"Session token invalid: {exc}")
        raise HTTPException(status_code=401, detail="Invalid token")

    user_id = sb_user.id
    email = sb_user.email or ""
    user_meta = sb_user.user_metadata or {}
    full_name = user_meta.get("full_name") or user_meta.get("name") or None
    avatar = user_meta.get("avatar_url") or user_meta.get("picture") or None

    log.info(f"Session upsert → {email}")

    supabase.table("user_profiles").upsert(
        {"id": user_id, "email": email, "full_name": full_name, "avatar_url": avatar},
        on_conflict="id",
    ).execute()

    row = (
        supabase.table("user_profiles")
        .select("id, email, full_name, avatar_url, role")
        .eq("id", user_id)
        .single()
        .execute()
    ).data

    if not row:
        raise HTTPException(status_code=500, detail="Failed to fetch profile after upsert")

    log.info(f"Profile ready → {email}  role={row['role']}")
    return UserProfile(
        id=row["id"],
        email=row["email"],
        full_name=row.get("full_name"),
        avatar_url=row.get("avatar_url"),
        role=UserRole(row["role"]),
    )


def change_user_role(user_id: str, new_role: UserRole) -> dict:
    supabase = get_supabase_admin()
    if not supabase.table("user_profiles").select("id").eq("id", user_id).maybe_single().execute().data:
        raise HTTPException(status_code=404, detail="User not found")
    supabase.table("user_profiles").update({"role": new_role.value}).eq("id", user_id).execute()
    log.info(f"Role changed → user={user_id}  new_role={new_role.value}")
    return {"message": "Role updated", "user_id": user_id, "new_role": new_role.value}


def list_all_users() -> list[dict]:
    return (
            get_supabase_admin()
            .table("user_profiles")
            .select("*")
            .order("created_at", desc=True)
            .execute()
            .data or []
    )


def delete_user_account(user_id: str):
    get_supabase_admin().auth.admin.delete_user(user_id)
    return {"status": "success"}
