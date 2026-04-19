from pydantic import BaseModel
from typing import Optional, Literal
from enum import Enum


class DatasetType(str, Enum):
    traffic = "traffic"
    weather = "weather"
    pollution = "pollution"


SCHEMA_FIELDS = {
    "traffic": {
        "required": ["timestamp", "vehicle_count"],
        "optional": ["speed_kmh", "city", "country_code", "source"],
    },
    "weather": {
        "required": ["timestamp", "temp"],
        "optional": ["humidity", "pressure", "wind_speed", "description", "city", "country_code", "source"],
    },
    "pollution": {
        "required": ["timestamp", "aqi_index"],
        "optional": ["pm2_5", "pm10", "o3", "no2", "so2", "co", "city", "country_code", "source"],
    },
}


class ColumnMapping(BaseModel):
    file_column: str
    schema_field: str


class UploadPreviewRequest(BaseModel):
    dataset_type: DatasetType
    mappings: list[ColumnMapping]
    rows: list[dict]


class ValidationResult(BaseModel):
    valid: bool
    total_rows: int
    null_errors: int
    format_errors: int
    duplicate_ts: int
    messages: list[str]
    preview: list[dict]


class UploadRequest(BaseModel):
    dataset_type: DatasetType
    mappings: list[ColumnMapping]
    rows: list[dict]


class UploadResponse(BaseModel):
    inserted: int
    skipped: int
    errors: int
    table: str
    messages: list[str]
