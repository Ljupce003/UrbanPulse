"""
Scenario Simulator 2: Pollution → Temperature

Place in: backend/ml/scenario_simulator/pollution_temperature_simulator.py

Sliders the user controls:
  - aqi             (Air Quality Index)
  - pm25            (µg/m³)
  - pm1             (µg/m³)

Predicts temp_avg_c showing how urban pollution levels correlate
with local temperature (urban heat / radiative forcing effect).

Uses LightGBM (or XGBoost) — whichever temp model was trained.
"""

import pandas as pd
import joblib
from pathlib import Path

MODEL_DIR = Path(__file__).resolve().parents[2] / "models"

FEATURE_COLS = [
    "pm1", "pm25", "aqi",
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
    aqi: float,
    pm25: float,
    pm1: float,
    temp_model: str = "lgbm_temp",
) -> dict:
    """
    Predict temp_avg_c from adjusted pollution inputs.

    Parameters
    ----------
    baseline   : pd.Series – median feature row (from build_baseline())
    aqi        : float – slider value
    pm25       : float – slider value (µg/m³)
    pm1        : float – slider value (µg/m³)
    temp_model : model filename stem under backend/models/

    Returns
    -------
    {"temp_avg_c": float}
    """
    row = baseline.copy()
    row["aqi"]  = aqi
    row["pm25"] = pm25
    row["pm1"]  = pm1

    for lag_col in ("aqi_lag_1h", "aqi_lag_2h", "aqi_lag_3h", "aqi_lag_6h",
                    "aqi_roll6h_mean", "aqi_roll24h_mean"):
        row[lag_col] = aqi
    row["aqi_roll24h_std"] = 0.0   # steady-state assumption
    row["pm25_lag1h"] = pm25
    row["pm1_lag1h"]  = pm1

    row["traffic_temp_interact"] = (
        row["traffic_vol_median"] * baseline.get("temp_avg_c", 15.0)
    )

    X = pd.DataFrame([row])[FEATURE_COLS]

    return {"temp_avg_c": float(_load(temp_model).predict(X)[0])}


def build_baseline() -> pd.Series:
    """
    Builds a median feature row from imputed_dataset.csv.
    Path is resolved relative to this file's location.
    """
    data_path = Path(__file__).resolve().parents[3] / "data" / "processed" / "imputed_dataset.csv"
    df = pd.read_csv(data_path, parse_dates=["timestamp"])
    return df[FEATURE_COLS + ["temp_avg_c"]].median()