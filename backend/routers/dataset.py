import logging
import io
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from fastapi.responses import JSONResponse
from backend.core.dependencies import require_analyst
from backend.core.config import get_supabase_admin
from backend.models.dataset import (
    UploadPreviewRequest, ValidationResult,
    UploadRequest, UploadResponse, DatasetType,
)
from backend.services.dataset_service import validate_rows, insert_rows

log = logging.getLogger("urbanpulse.dataset")
router = APIRouter(prefix="/api/data", tags=["data"])

BUCKET = "datasets"


def _ensure_bucket():
    supabase = get_supabase_admin()
    try:
        buckets = supabase.storage.list_buckets()
        names = [b.name for b in buckets]
        if BUCKET not in names:
            supabase.storage.create_bucket(BUCKET, options={"public": False})
            log.info(f"Created storage bucket: {BUCKET}")
    except Exception as e:
        log.warning(f"Bucket check failed (may already exist): {e}")


@router.post("/store")
async def store_file(
        file: UploadFile = File(...),
        dataset_type: str = Form(...),
        current_user: dict = Depends(require_analyst),
):
    _ensure_bucket()

    allowed_types = {"traffic", "weather", "pollution"}
    if dataset_type not in allowed_types:
        raise HTTPException(status_code=400, detail=f"dataset_type must be one of {allowed_types}")

    ext = file.filename.rsplit(".", 1)[-1].lower()
    if ext not in ("csv", "json"):
        raise HTTPException(status_code=400, detail="Only CSV and JSON files are supported")

    month = datetime.now(timezone.utc).strftime("%Y-%m")
    user_id = current_user["id"][:8]  # first 8 chars of UUID is enough
    safe_name = file.filename.replace(" ", "_")
    ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S")
    path = f"{dataset_type}/{month}/{ts}_{user_id}_{safe_name}"

    contents = await file.read()

    supabase = get_supabase_admin()
    try:
        supabase.storage.from_(BUCKET).upload(
            path,
            contents,
            file_options={"content-type": file.content_type or "application/octet-stream"},
        )
        log.info(f"Stored file → {BUCKET}/{path}  ({len(contents)} bytes)")
    except Exception as e:
        log.error(f"Storage upload failed: {e}")
        raise HTTPException(status_code=500, detail=f"Storage upload failed: {e}")

    return {
        "bucket": BUCKET,
        "path": path,
        "size": len(contents),
    }


@router.post("/validate", response_model=ValidationResult)
async def validate_dataset(
        body: UploadPreviewRequest,
        _: dict = Depends(require_analyst),
):
    if not body.rows:
        raise HTTPException(status_code=400, detail="No rows provided")
    if len(body.rows) > 50_000:
        raise HTTPException(status_code=400, detail="Max 50,000 rows per upload")
    return validate_rows(body.dataset_type, body.mappings, body.rows)


@router.post("/upload", response_model=UploadResponse)
async def upload_dataset(
        body: UploadRequest,
        _: dict = Depends(require_analyst),
):
    if not body.rows:
        raise HTTPException(status_code=400, detail="No rows provided")
    if len(body.rows) > 50_000:
        raise HTTPException(status_code=400, detail="Max 50,000 rows per upload")
    return insert_rows(body.dataset_type, body.mappings, body.rows)
