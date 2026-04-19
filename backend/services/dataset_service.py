import logging
from datetime import datetime, timezone
from backend.models.dataset import (
    ColumnMapping, DatasetType, ValidationResult,
    UploadResponse, SCHEMA_FIELDS,
)
from backend.core.config import get_supabase_admin

log = logging.getLogger("urbanpulse.dataset")

TABLE_MAP = {
    DatasetType.traffic: "uploaded_traffic",
    DatasetType.weather: "uploaded_weather",
    DatasetType.pollution: "uploaded_pollution",
}


def _apply_mappings(rows: list[dict], mappings: list[ColumnMapping]) -> list[dict]:
    rename = {m.file_column: m.schema_field for m in mappings}
    result = []
    for row in rows:
        mapped = {}
        for k, v in row.items():
            mapped[rename.get(k, k)] = v
        result.append(mapped)
    return result


def _parse_timestamp(value: str) -> str | None:
    if not value:
        return None
    formats = [
        "%Y-%m-%dT%H:%M:%S",
        "%Y-%m-%dT%H:%M:%SZ",
        "%Y-%m-%dT%H:%M:%S%z",
        "%Y-%m-%d %H:%M:%S",
        "%Y-%m-%d %H:%M",
        "%d/%m/%Y %H:%M:%S",
        "%d/%m/%Y %H:%M",
        "%m/%d/%Y %H:%M:%S",
        "%Y-%m-%d",
    ]
    for fmt in formats:
        try:
            dt = datetime.strptime(str(value).strip(), fmt)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            else:
                dt = dt.astimezone(timezone.utc)
            return dt.isoformat()
        except ValueError:
            continue
    return None


def validate_rows(
        dataset_type: DatasetType,
        mappings: list[ColumnMapping],
        rows: list[dict],
) -> ValidationResult:
    schema = SCHEMA_FIELDS[dataset_type]
    required = schema["required"]
    mapped = _apply_mappings(rows, mappings)

    null_errors = 0
    format_errors = 0
    messages = []
    seen_ts = set()
    duplicate_ts = 0
    clean_rows = []

    for i, row in enumerate(mapped):
        row_errors = []

        for field in required:
            val = row.get(field)
            if val is None or str(val).strip() == "":
                null_errors += 1
                row_errors.append(f"row {i + 1}: '{field}' is null/empty")

        if "timestamp" in row:
            parsed = _parse_timestamp(str(row["timestamp"]))
            if parsed is None:
                format_errors += 1
                row_errors.append(f"row {i + 1}: cannot parse timestamp '{row['timestamp']}'")
            else:
                row["timestamp"] = parsed
                if parsed in seen_ts:
                    duplicate_ts += 1
                    row_errors.append(f"row {i + 1}: duplicate timestamp {parsed}")
                seen_ts.add(parsed)

        numeric_fields = [f for f in schema["required"] + schema["optional"] if
                          f not in ("timestamp", "city", "country_code", "source", "description")]
        for field in numeric_fields:
            if field in row and row[field] not in (None, ""):
                try:
                    row[field] = float(row[field])
                except (ValueError, TypeError):
                    format_errors += 1
                    row_errors.append(f"row {i + 1}: '{field}' is not numeric (got '{row[field]}')")

        messages.extend(row_errors)
        if not row_errors:
            clean_rows.append(row)

    valid = null_errors == 0 and format_errors == 0
    if valid:
        messages.append(f"✓ All {len(rows)} rows passed validation")
    else:
        messages.insert(0,
                        f"✗ {null_errors} null errors, {format_errors} format errors, {duplicate_ts} duplicates found")

    log.info(
        f"Validation [{dataset_type}]: {len(rows)} rows → valid={valid} nulls={null_errors} fmt={format_errors} dups={duplicate_ts}")

    return ValidationResult(
        valid=valid,
        total_rows=len(rows),
        null_errors=null_errors,
        format_errors=format_errors,
        duplicate_ts=duplicate_ts,
        messages=messages[:50],
        preview=clean_rows[:3],
    )


def insert_rows(
        dataset_type: DatasetType,
        mappings: list[ColumnMapping],
        rows: list[dict],
) -> UploadResponse:
    supabase = get_supabase_admin()
    table = TABLE_MAP[dataset_type]
    schema = SCHEMA_FIELDS[dataset_type]
    mapped = _apply_mappings(rows, mappings)

    allowed_fields = set(schema["required"] + schema["optional"])
    inserted = 0
    skipped = 0
    errors = 0
    messages = []
    batch = []
    BATCH_SIZE = 100

    for i, row in enumerate(mapped):
        vr = validate_rows(dataset_type, [], [row])  # empty mappings — already mapped
        if not vr.valid:
            skipped += 1
            continue

        clean = {k: v for k, v in row.items() if k in allowed_fields}
        clean["uploaded_at"] = datetime.now(timezone.utc).isoformat()
        batch.append(clean)

        if len(batch) >= BATCH_SIZE:
            try:
                supabase.table(table).upsert(batch, on_conflict="timestamp,city").execute()
                inserted += len(batch)
            except Exception as e:
                log.error(f"Batch insert failed: {e}")
                errors += len(batch)
                messages.append(f"Batch error at row ~{i}: {e}")
            batch = []

    if batch:
        try:
            supabase.table(table).upsert(batch, on_conflict="timestamp,city").execute()
            inserted += len(batch)
        except Exception as e:
            log.error(f"Final batch insert failed: {e}")
            errors += len(batch)
            messages.append(f"Final batch error: {e}")

    log.info(f"Upload [{dataset_type}→{table}]: inserted={inserted} skipped={skipped} errors={errors}")
    messages.insert(0, f"Inserted {inserted} rows into {table}. Skipped {skipped}, errors {errors}.")

    return UploadResponse(
        inserted=inserted,
        skipped=skipped,
        errors=errors,
        table=table,
        messages=messages,
    )
