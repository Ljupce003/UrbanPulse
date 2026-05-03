"""Build upload-ready payload JSON files for UrbanPulse dataset endpoints.

Produces payloads for `/api/data/upload`:
{
  "dataset_type": "traffic|weather|pollution",
  "mappings": [],
  "rows": [...]
}
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Optional

import pandas as pd

# Common timestamp candidates
TIME_CANDIDATES = [
    "timestamp",
    "time",
    "datetime",
    "date",
    "ts",
    "utc_time",
    "datetimeutc",
    "date_utc",
]

# Schema fields expected by the backend (see backend/models/dataset.py)
TRAFFIC_FIELDS = ["timestamp", "vehicle_count", "speed_kmh", "city", "country_code", "source"]
WEATHER_FIELDS = ["timestamp", "temp", "humidity", "pressure", "wind_speed", "description", "city", "country_code", "source"]
POLLUTION_FIELDS = ["timestamp", "aqi_index", "pm2_5", "pm10", "o3", "no2", "so2", "co", "city", "country_code", "source"]


def read_table(input_path: Path) -> pd.DataFrame:
    ext = input_path.suffix.lower()
    if ext == ".csv":
        return pd.read_csv(str(input_path))
    if ext == ".json":
        with open(input_path, "r", encoding="utf-8") as f:
            payload = json.load(f)
        if isinstance(payload, list):
            return pd.DataFrame(payload)
        if isinstance(payload, dict) and isinstance(payload.get("data"), list):
            return pd.DataFrame(payload["data"])
        if isinstance(payload, dict) and isinstance(payload.get("rows"), list):
            return pd.DataFrame(payload["rows"])
        raise ValueError("Unsupported JSON structure. Expected a list or object with 'data'/'rows'.")
    raise ValueError(f"Unsupported input file extension: {ext}. Use .csv or .json")


def detect_time_column(df: pd.DataFrame) -> Optional[str]:
    for c in df.columns:
        if c.lower() in TIME_CANDIDATES:
            return c
    for c in df.columns:
        if "date" in c.lower() or "time" in c.lower():
            return c
    return None


def parse_timestamp_series(series: pd.Series) -> pd.Series:
    return pd.to_datetime(series, errors="coerce", utc=True)


def to_iso_no_tz(ts: pd.Timestamp) -> str:
    if pd.isna(ts):
        return ""
    if ts.tzinfo is not None:
        ts = ts.tz_convert("UTC").tz_localize(None)
    return ts.strftime("%Y-%m-%dT%H:%M:%S")


# --- AQI helper (approximate) ---
# We include a simple PM2.5 -> AQI converter using US EPA breakpoints for PM2.5.
# This is an approximation and may not match your region's AQI calculation.

PM25_BREAKPOINTS = [
    (0.0, 12.0, 0, 50),
    (12.1, 35.4, 51, 100),
    (35.5, 55.4, 101, 150),
    (55.5, 150.4, 151, 200),
    (150.5, 250.4, 201, 300),
    (250.5, 350.4, 301, 400),
    (350.5, 500.4, 401, 500),
]


def pm25_to_aqi(pm25: float) -> Optional[int]:
    try:
        val = float(pm25)
    except Exception:
        return None
    for (clow, chigh, ilow, ihigh) in PM25_BREAKPOINTS:
        if clow <= val <= chigh:
            aqi = (ihigh - ilow) / (chigh - clow) * (val - clow) + ilow
            return int(round(aqi))
    return None


# --- Preprocessors ---

def preprocess_traffic(
    input_path: Path,
    city: Optional[str],
    country_code: Optional[str],
    resample: str = "1h",
    impute: str = "interpolate",
):
    df = read_table(input_path)

    # Notebook-compatible traffic input: Yr, M, D, HH, MM + Vol
    traffic_time_parts = ["Yr", "M", "D", "HH", "MM"]
    if all(c in df.columns for c in traffic_time_parts):
        if "Vol" not in df.columns and "volume" not in [c.lower() for c in df.columns]:
            raise ValueError("Traffic file has Yr/M/D/HH/MM but no Vol column.")
        vol_col = "Vol" if "Vol" in df.columns else next(c for c in df.columns if c.lower() == "volume")
        tmp = df[traffic_time_parts + [vol_col]].copy()
        for col in traffic_time_parts:
            tmp[col] = pd.to_numeric(tmp[col], errors="coerce")
        tmp[vol_col] = pd.to_numeric(tmp[vol_col], errors="coerce")
        tmp = tmp.dropna(subset=traffic_time_parts)
        tmp["timestamp"] = pd.to_datetime(
            tmp[["Yr", "M", "D", "HH", "MM"]].rename(
                columns={"Yr": "year", "M": "month", "D": "day", "HH": "hour", "MM": "minute"}
            ),
            errors="coerce",
            utc=True,
        )
        tmp = tmp.dropna(subset=["timestamp"])
        df = tmp[["timestamp", vol_col]].rename(columns={vol_col: "vehicle_count"})
    else:
        time_col = detect_time_column(df)
        if time_col is None:
            raise ValueError("Could not detect a timestamp column in traffic file.")
        df[time_col] = parse_timestamp_series(df[time_col])
        if df[time_col].isna().all():
            raise ValueError("All parsed timestamps are NaT. Check timestamp format.")

        col_lower = {c.lower(): c for c in df.columns}
        vehicle_col = None
        for candidate in ["vehicle_count", "vehiclecount", "vol", "volume", "count", "traffic_volume", "vehicles"]:
            if candidate in col_lower:
                vehicle_col = col_lower[candidate]
                break

        if vehicle_col is None:
            numeric_cols = df.select_dtypes(include=["number"]).columns.tolist()
            numeric_cols = [c for c in numeric_cols if c != time_col]
            if len(numeric_cols) == 1:
                vehicle_col = numeric_cols[0]
            else:
                raise ValueError("Could not detect vehicle_count column automatically.")

        speed_col = None
        for candidate in ["speed_kmh", "speed", "avg_speed", "speed_km/h", "speed_km"]:
            if candidate in col_lower:
                speed_col = col_lower[candidate]
                break

        df = df[[time_col, vehicle_col] + ([speed_col] if speed_col else [])].copy()
        df = df.rename(columns={time_col: "timestamp", vehicle_col: "vehicle_count"})
        if speed_col:
            df = df.rename(columns={speed_col: "speed_kmh"})

    df = df.dropna(subset=["timestamp"])
    df = df.set_index("timestamp").sort_index()

    df["vehicle_count"] = pd.to_numeric(df["vehicle_count"], errors="coerce")
    if "speed_kmh" in df.columns:
        df["speed_kmh"] = pd.to_numeric(df["speed_kmh"], errors="coerce")

    # Per notebook flow: traffic volume is summed per resample window.
    agg = {"vehicle_count": "sum"}
    if "speed_kmh" in df.columns:
        agg["speed_kmh"] = "mean"

    df_res = df.resample(resample).agg(agg)

    if impute == "interpolate":
        df_res["vehicle_count"] = df_res["vehicle_count"].interpolate(limit_direction="both")
        if "speed_kmh" in df_res.columns:
            df_res["speed_kmh"] = df_res["speed_kmh"].interpolate(limit_direction="both")
    elif impute == "ffill":
        df_res = df_res.ffill().bfill()
    elif impute == "zero":
        df_res = df_res.fillna(0)

    # Required field for upload: vehicle_count
    df_res = df_res.dropna(subset=["vehicle_count"])
    df_res = df_res.reset_index()

    rows = []
    for _, r in df_res.iterrows():
        row: dict[str, object] = {
            "timestamp": to_iso_no_tz(r["timestamp"]),
            "vehicle_count": float(r["vehicle_count"]) if not pd.isna(r["vehicle_count"]) else None,
            "source": "manual_upload",
        }
        if "speed_kmh" in r.index and not pd.isna(r["speed_kmh"]):
            row["speed_kmh"] = float(r["speed_kmh"])
        if city:
            row["city"] = city
        if country_code:
            row["country_code"] = country_code
        rows.append(row)

    payload = {"dataset_type": "traffic", "mappings": [], "rows": rows[:50000]}
    return payload


def preprocess_weather(input_path: Path, city: Optional[str], country_code: Optional[str], resample: str = "1h"):
    df = read_table(input_path)
    time_col = detect_time_column(df)
    if time_col is None:
        raise ValueError("Could not detect a timestamp column in weather file.")

    df[time_col] = parse_timestamp_series(df[time_col])
    if df[time_col].isna().all():
        raise ValueError("All parsed timestamps are NaT. Check timestamp format.")

    col_lower = {c.lower(): c for c in df.columns}
    temp_col = None
    for candidate in ["temp", "tavg", "temperature", "air_temp", "temp_c"]:
        if candidate in col_lower:
            temp_col = col_lower[candidate]
            break
    if temp_col is None:
        raise ValueError("Could not detect temperature column automatically.")

    humidity_col = None
    for candidate in ["humidity", "hum", "rh"]:
        if candidate in col_lower:
            humidity_col = col_lower[candidate]
            break

    pressure_col = None
    for candidate in ["pressure", "press", "atm"]:
        if candidate in col_lower:
            pressure_col = col_lower[candidate]
            break

    wind_col = None
    for candidate in ["wind_speed", "wind", "ws", "windspeed"]:
        if candidate in col_lower:
            wind_col = col_lower[candidate]
            break

    desc_col = None
    for candidate in ["description", "weather", "desc"]:
        if candidate in col_lower:
            desc_col = col_lower[candidate]
            break

    keep = [time_col, temp_col]
    if humidity_col: keep.append(humidity_col)
    if pressure_col: keep.append(pressure_col)
    if wind_col: keep.append(wind_col)
    if desc_col: keep.append(desc_col)

    df = df[keep].copy()
    rename_map = {time_col: "timestamp", temp_col: "temp"}
    if humidity_col: rename_map[humidity_col] = "humidity"
    if pressure_col: rename_map[pressure_col] = "pressure"
    if wind_col: rename_map[wind_col] = "wind_speed"
    if desc_col: rename_map[desc_col] = "description"

    df = df.rename(columns=rename_map)
    df = df.dropna(subset=["timestamp"])
    df["timestamp"] = parse_timestamp_series(df["timestamp"])
    df = df.set_index("timestamp").sort_index()

    # Daily weather to hourly (notebook style): forward fill.
    df_res = df.resample(resample).ffill().reset_index()

    # Convert numeric
    df_res["temp"] = pd.to_numeric(df_res["temp"], errors="coerce")
    if "humidity" in df_res.columns:
        df_res["humidity"] = pd.to_numeric(df_res["humidity"], errors="coerce")
    if "pressure" in df_res.columns:
        df_res["pressure"] = pd.to_numeric(df_res["pressure"], errors="coerce")
    if "wind_speed" in df_res.columns:
        df_res["wind_speed"] = pd.to_numeric(df_res["wind_speed"], errors="coerce")

    df_res = df_res.dropna(subset=["temp"])

    rows = []
    for _, r in df_res.iterrows():
        row: dict[str, object] = {
            "timestamp": to_iso_no_tz(r["timestamp"]),
            "temp": float(r["temp"]) if not pd.isna(r["temp"]) else None,
            "source": "manual_upload",
        }
        if "humidity" in r.index and not pd.isna(r["humidity"]):
            row["humidity"] = float(r["humidity"])
        if "pressure" in r.index and not pd.isna(r["pressure"]):
            row["pressure"] = float(r["pressure"])
        if "wind_speed" in r.index and not pd.isna(r["wind_speed"]):
            row["wind_speed"] = float(r["wind_speed"])
        if "description" in r.index and not pd.isna(r["description"]):
            row["description"] = str(r["description"])[:255]
        if city:
            row["city"] = city
        if country_code:
            row["country_code"] = country_code
        rows.append(row)

    payload = {"dataset_type": "weather", "mappings": [], "rows": rows[:50000]}
    return payload


def preprocess_pollution(input_path: Path, city: Optional[str], country_code: Optional[str], resample: str = "1h"):
    df = read_table(input_path)
    time_col = detect_time_column(df)
    if time_col is None:
        if "datetimeUtc" in df.columns:
            time_col = "datetimeUtc"
        else:
            raise ValueError("Could not detect a timestamp column in pollution file.")

    df[time_col] = parse_timestamp_series(df[time_col])
    if df[time_col].isna().all():
        raise ValueError("All parsed timestamps are NaT. Check timestamp format.")

    col_lower = {c.lower(): c for c in df.columns}
    pm25_col = col_lower.get("pm25") or col_lower.get("pm2_5") or col_lower.get("pm2.5")
    pm10_col = col_lower.get("pm10")
    o3_col = col_lower.get("o3")
    no2_col = col_lower.get("no2")
    so2_col = col_lower.get("so2")
    co_col = col_lower.get("co")
    aqi_col = None
    for candidate in ["aqi_index", "aqi", "aqi_value", "aqiindex"]:
        if candidate in col_lower:
            aqi_col = col_lower[candidate]
            break

    if "parameter" in df.columns and "value" in df.columns:
        try:
            pivot = df.pivot_table(index=time_col, columns="parameter", values="value", aggfunc="mean").reset_index()
            df = pivot
            col_lower = {c.lower(): c for c in df.columns}
            pm25_col = col_lower.get("pm25") or col_lower.get("pm2_5") or col_lower.get("pm2.5")
            pm10_col = col_lower.get("pm10")
            o3_col = col_lower.get("o3")
            no2_col = col_lower.get("no2")
            so2_col = col_lower.get("so2")
            co_col = col_lower.get("co")
        except Exception:
            pass

    keep = [time_col]
    for c in [aqi_col, pm25_col, pm10_col, o3_col, no2_col, so2_col, co_col]:
        if c:
            keep.append(c)

    df = df[[c for c in keep if c in df.columns]].copy()
    rename_map = {time_col: "timestamp"}
    if aqi_col: rename_map[aqi_col] = "aqi_index"
    if pm25_col: rename_map[pm25_col] = "pm2_5"
    if pm10_col: rename_map[pm10_col] = "pm10"
    if o3_col: rename_map[o3_col] = "o3"
    if no2_col: rename_map[no2_col] = "no2"
    if so2_col: rename_map[so2_col] = "so2"
    if co_col: rename_map[co_col] = "co"

    df = df.rename(columns=rename_map)
    df = df.dropna(subset=["timestamp"])
    df["timestamp"] = parse_timestamp_series(df["timestamp"])
    df = df.set_index("timestamp").sort_index()

    df_res = df.resample(resample).mean()

    # Required field for upload: aqi_index. Derive from PM2.5 when absent.
    if "aqi_index" not in df_res.columns and "pm2_5" in df_res.columns:
        df_res["aqi_index"] = df_res["pm2_5"].apply(lambda v: pm25_to_aqi(v) if not pd.isna(v) else None)

    if "aqi_index" not in df_res.columns:
        raise ValueError("Pollution dataset must include aqi_index or pm2_5 to derive aqi_index.")

    df_res = df_res.dropna(subset=["aqi_index"])
    df_res = df_res.reset_index()

    rows = []
    for _, r in df_res.iterrows():
        row: dict[str, object] = {
            "timestamp": to_iso_no_tz(r["timestamp"]),
            "source": "manual_upload",
        }
        if "aqi_index" in r.index and not pd.isna(r["aqi_index"]):
            try:
                row["aqi_index"] = float(r["aqi_index"]) if not pd.isna(r["aqi_index"]) else None
            except Exception:
                pass
        if "pm2_5" in r.index and not pd.isna(r["pm2_5"]):
            row["pm2_5"] = float(r["pm2_5"]) if not pd.isna(r["pm2_5"]) else None
        if "pm10" in r.index and not pd.isna(r["pm10"]):
            row["pm10"] = float(r["pm10"]) if not pd.isna(r["pm10"]) else None
        if "o3" in r.index and not pd.isna(r["o3"]):
            row["o3"] = float(r["o3"]) if not pd.isna(r["o3"]) else None
        if "no2" in r.index and not pd.isna(r["no2"]):
            row["no2"] = float(r["no2"]) if not pd.isna(r["no2"]) else None
        if "so2" in r.index and not pd.isna(r["so2"]):
            row["so2"] = float(r["so2"]) if not pd.isna(r["so2"]) else None
        if "co" in r.index and not pd.isna(r["co"]):
            row["co"] = float(r["co"]) if not pd.isna(r["co"]) else None
        if city:
            row["city"] = city
        if country_code:
            row["country_code"] = country_code
        rows.append(row)

    payload = {"dataset_type": "pollution", "mappings": [], "rows": rows[:50000]}
    return payload


def write_output(payload: dict, output_path: Path):
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=True, indent=2)


def write_jsonl_rows(payload: dict, output_path: Path):
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        for row in payload["rows"]:
            f.write(json.dumps(row, ensure_ascii=True) + "\n")


def default_output_for(dataset_type: str, out_dir: Path) -> Path:
    return out_dir / f"{dataset_type}_payload.json"


def normalize_city_arg(city_arg: Optional[list[str]]) -> Optional[str]:
    if not city_arg:
        return None
    normalized = " ".join(part.strip() for part in city_arg if part.strip()).strip()
    return normalized or None


def main():
    p = argparse.ArgumentParser(description="Preprocess dataset(s) into /api/data/upload JSON payload")
    p.add_argument("--type", required=True, choices=["traffic", "weather", "pollution", "all"], help="Dataset type")
    p.add_argument("--input", help="Input path for single-type mode")
    p.add_argument("--output", help="Output JSON path for single-type mode")
    p.add_argument("--traffic-input", help="Input path for traffic when --type all")
    p.add_argument("--weather-input", help="Input path for weather when --type all")
    p.add_argument("--pollution-input", help="Input path for pollution when --type all")
    p.add_argument("--out-dir", default="data/processed/payloads", help="Output folder for --type all")
    p.add_argument(
        "--city",
        nargs="+",
        default=None,
        help="Optional city name to include in rows (supports multi-word, e.g. --city New York)",
    )
    p.add_argument("--country", default=None, help="Optional country code to include in rows")
    p.add_argument("--resample", default="1h", help="Resample frequency, e.g. 1H, 30T")
    p.add_argument("--impute", default="interpolate", choices=["interpolate", "ffill", "zero"], help="Imputation method for traffic")
    p.add_argument("--jsonl", action="store_true", help="Also export row-only JSONL files")
    args = p.parse_args()

    city_value = normalize_city_arg(args.city)

    if args.type == "all":
        missing = [
            name
            for name, value in [
                ("--traffic-input", args.traffic_input),
                ("--weather-input", args.weather_input),
                ("--pollution-input", args.pollution_input),
            ]
            if not value
        ]
        if missing:
            raise SystemExit(f"Missing required arguments for --type all: {', '.join(missing)}")

        out_dir = Path(args.out_dir)
        specs = [
            ("traffic", Path(args.traffic_input), preprocess_traffic),
            ("weather", Path(args.weather_input), preprocess_weather),
            ("pollution", Path(args.pollution_input), preprocess_pollution),
        ]

        for dataset_type, input_path, fn in specs:
            if not input_path.exists():
                raise SystemExit(f"Input file not found: {input_path}")
            if dataset_type == "traffic":
                payload = fn(input_path, city=city_value, country_code=args.country, resample=args.resample, impute=args.impute)
            else:
                payload = fn(input_path, city=city_value, country_code=args.country, resample=args.resample)

            output_path = default_output_for(dataset_type, out_dir)
            write_output(payload, output_path)
            print(f"[{dataset_type}] wrote {len(payload['rows']):,} rows -> {output_path}")

            if args.jsonl:
                jsonl_path = out_dir / f"{dataset_type}_rows.jsonl"
                write_jsonl_rows(payload, jsonl_path)
                print(f"[{dataset_type}] wrote JSONL rows -> {jsonl_path}")

        return

    if not args.input or not args.output:
        raise SystemExit("Single-type mode requires both --input and --output.")

    input_path = Path(args.input)
    output_path = Path(args.output)
    if not input_path.exists():
        raise SystemExit(f"Input file not found: {input_path}")

    if args.type == "traffic":
        payload = preprocess_traffic(input_path, city=city_value, country_code=args.country, resample=args.resample, impute=args.impute)
    elif args.type == "weather":
        payload = preprocess_weather(input_path, city=city_value, country_code=args.country, resample=args.resample)
    else:
        payload = preprocess_pollution(input_path, city=city_value, country_code=args.country, resample=args.resample)

    write_output(payload, output_path)
    print(f"Wrote {len(payload['rows']):,} rows to {output_path}")

    if args.jsonl:
        write_jsonl_rows(payload, output_path.with_suffix(".jsonl"))
        print(f"Wrote JSONL rows to {output_path.with_suffix('.jsonl')}")


if __name__ == "__main__":
    main()

