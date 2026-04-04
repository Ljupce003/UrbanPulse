from fastapi import APIRouter

from app.services.status_service import get_status_payload

router = APIRouter(prefix="/status", tags=["status"])


@router.get("/")
def read_status() -> dict:
    return get_status_payload()

