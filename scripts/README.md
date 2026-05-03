# Dataset Prep Scripts

These scripts generate payload files ready for UrbanPulse backend dataset endpoints.

## Recommended project layout

- Raw datasets: `data/raw/`
- Interim datasets (imputed/working): `data/interim/`
- Generated upload payloads: `data/processed/payloads/`
- Jupyter notebooks: `notebooks/exploration/`

## What backend expects

`POST /api/data/upload` expects JSON:

```json
{
  "dataset_type": "traffic|weather|pollution",
  "mappings": [],
  "rows": [
    {"timestamp": "YYYY-MM-DDTHH:MM:SS", "...": "..."}
  ]
}
```

Required fields by type (from backend schema):
- `traffic`: `timestamp`, `vehicle_count`
- `weather`: `timestamp`, `temp`
- `pollution`: `timestamp`, `aqi_index`

## Scripts

- `scripts/prepare_dataset.py`
  - Preprocesses raw CSV/JSON into upload-ready payload JSON.
  - Supports `--type traffic|weather|pollution|all`.
  - Handles notebook-style traffic input (`Yr,M,D,HH,MM,Vol`) and `traffic_imputed.csv` style (`timestamp,Vol`).
  - Includes traffic imputation options: `interpolate`, `ffill`, `zero`.

- `scripts/upload_payload.py`
  - Calls `/api/data/validate` (first 200 rows) and then `/api/data/upload`.

- `scripts/smoke_test_prepare.py`
  - Small local smoke test for payload structure.

## Install dependencies

```powershell
python -m pip install pandas
```

## Generate all 3 payloads from workspace datasets

```powershell
python scripts\prepare_dataset.py --type all --traffic-input data\raw\traffic.csv --weather-input data\raw\weather.csv --pollution-input data\raw\pollution.csv --out-dir data\processed\payloads --city Skopje --country MK --impute interpolate --jsonl
```

Outputs:
- `data/processed/payloads/traffic_payload.json`
- `data/processed/payloads/weather_payload.json`
- `data/processed/payloads/pollution_payload.json`
- optional `*.jsonl` when `--jsonl` is set

## Generate single payload

```powershell
python scripts\prepare_dataset.py --type traffic --input data\interim\traffic_imputed.csv --output data\processed\payloads\traffic_payload.json --city Skopje --country MK --impute interpolate
```

Multi-word city is supported either quoted or unquoted:

```powershell
python scripts\prepare_dataset.py --type traffic --input data\interim\traffic_imputed.csv --output data\processed\payloads\traffic_ny_payload.json --city New York --country US
python scripts\prepare_dataset.py --type traffic --input data\interim\traffic_imputed.csv --output data\processed\payloads\traffic_ny_payload.json --city "New York" --country US
```

## Upload payload to backend

```powershell
python scripts\upload_payload.py --payload data\processed\payloads\traffic_payload.json --base-url http://127.0.0.1:8080 --token <YOUR_ANALYST_OR_ADMIN_BEARER_TOKEN>
```

## Notes

- Payload rows are capped at 50,000 to match backend upload limits.
- Timestamps are emitted as UTC-normalized naive ISO strings (`YYYY-MM-DDTHH:MM:SS`).
- Pollution `aqi_index` is derived from `pm2_5` if missing, using an approximate PM2.5->AQI mapping.

