"""
Scenario Simulator 1: Traffic & Temperature → Pollution (AQI / PM2.5)

Place in: backend/ml/scenario_simulator/traffic_pollution_simulator.py

Sliders the user controls:
  - traffic_vol_median   (vehicles per interval)
  - traffic_intensity    (normalised 0–1 or raw count)
  - is_rush_hour         (bool toggle)
  - temp_avg_c           (°C)

All other features are kept at their baseline values (e.g. dataset medians).
"""

import pandas as pd
import joblib
from pathlib import Path

MODEL_DIR = Path(__file__).resolve().parents[2] / "models"

FEATURE_COLS = [
    "pm1", "pm25", "temp_avg_c", "temp_min_c", "temp_max_c",
    "precip_mm", "wind_speed_kmh", "pressure_hpa",
    "hour_of_day", "day_of_week", "month", "is_weekday",
    "traffic_vol_median", "traffic_intensity", "is_rush_hour",
    "hour_sin", "hour_cos", "month_sin", "month_cos",
    "wind_dir_sin", "wind_dir_cos",
    "aqi_lag_1h", "aqi_lag_2h", "aqi_lag_3h", "aqi_lag_6h",
    "aqi_roll6h_mean", "aqi_roll24h_mean", "aqi_roll24h_std",
    "pm25_lag1h", "pm1_lag1h", "traffic_temp_interact",
]


def _load(name: str):
    for ext in ("joblib", "pkl"):
        p = MODEL_DIR / f"{name}.{ext}"
        if p.exists():
            return joblib.load(p)
    raise FileNotFoundError(f"Model '{name}' not found in {MODEL_DIR}")


def simulate(
    baseline: pd.Series,
    traffic_vol_median: float,
    traffic_intensity: float,
    is_rush_hour: bool,
    temp_avg_c: float,
    aqi_model: str = "xgboost_aqi",
    pm25_model: str = "xgboost_pm25",
) -> dict:
    row = baseline.copy()
    row["traffic_vol_median"]    = traffic_vol_median
    row["traffic_intensity"]     = traffic_intensity
    row["is_rush_hour"]          = int(is_rush_hour)
    row["temp_avg_c"]            = temp_avg_c
    row["temp_min_c"]            = temp_avg_c - 3
    row["temp_max_c"]            = temp_avg_c + 3
    row["traffic_temp_interact"] = traffic_vol_median * temp_avg_c

    X = pd.DataFrame([row])[FEATURE_COLS]

    result = {"aqi": float(_load(aqi_model).predict(X)[0]), "pm25": None}

    try:
        result["pm25"] = float(_load(pm25_model).predict(X)[0])
    except FileNotFoundError:
        pass

    return result


def build_baseline() -> pd.Series:
    data_path = Path(__file__).resolve().parents[3] / "data" / "processed" / "imputed_dataset.csv"
    df = pd.read_csv(data_path, parse_dates=["timestamp"])
    return df[FEATURE_COLS].median()