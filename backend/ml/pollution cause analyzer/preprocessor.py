"""
ml/pollution_cause_analyzer/preprocessor.py
============================================
Merges pollution.csv, weather.csv, and traffic.csv into a single
model-ready DataFrame.

Pipeline:
  1. Pollution  → pivot long→wide, compute hourly AQI composite (US EPA)
  2. Weather    → daily → broadcast to hourly, fill missing sensors
  3. Traffic    → extract cyclic time features from historical Vol pattern
  4. Merge on UTC hour, restrict to overlapping date range
  5. Add lag / rolling features, drop NaN rows
  6. Save to data/processed/merged_features.csv

Run standalone:
    python preprocessor.py
"""

from __future__ import annotations

import warnings
from pathlib import Path

import numpy as np
import pandas as pd

warnings.filterwarnings("ignore")

ROOT  = Path(__file__).resolve().parent.parent.parent
DATA_DIR = ROOT / "data" / "processed" / "payloads"
OUT_PATH  = ROOT / "data" / "processed" / "merged_features.csv"

POLLUTION_CSV = DATA_DIR / "pollution.csv"
WEATHER_CSV = DATA_DIR / "weather.csv"
TRAFFIC_CSV = DATA_DIR / "traffic.csv"


PM25_BREAKPOINTS = [
    (0.0,   12.0,   0,  50),
    (12.1,  35.4,  51, 100),
    (35.5,  55.4, 101, 150),
    (55.5, 150.4, 151, 200),
    (150.5, 250.4, 201, 300),
    (250.5, 500.4, 301, 500),
]

PM1_BREAKPOINTS = [
    (0.0,    8.4,   0,  50),
    (8.5,   24.7,  51, 100),
    (24.8,  38.7, 101, 150),
    (38.8, 105.2, 151, 200),
    (105.3, 175.2, 201, 300),
    (175.3, 350.2, 301, 500),
]

O3_BREAKPOINTS = [
    (0,   54,   0,  50),
    (55,  70,  51, 100),
    (71,  85, 101, 150),
    (86, 105, 151, 200),
    (106, 200, 201, 300),
]

NO2_BREAKPOINTS = [
    (0,    53,   0,  50),
    (54,  100,  51, 100),
    (101, 360, 101, 150),
    (361, 649, 151, 200),
    (650, 1249, 201, 300),
]


def _aqi_from_conc(conc: float, breakpoints: list) -> float:
    """Linear interpolation within EPA breakpoint table."""
    if np.isnan(conc) or conc < 0:
        return np.nan
    for c_lo, c_hi, i_lo, i_hi in breakpoints:
        if c_lo <= conc <= c_hi:
            return (i_hi - i_lo) / (c_hi - c_lo) * (conc - c_lo) + i_lo
    return 500.0  # hazardous ceiling


def compute_aqi_row(row: pd.Series) -> float:
    """Max sub-index AQI across available pollutants."""
    sub = []
    if not np.isnan(row.get("pm25", np.nan)):
        sub.append(_aqi_from_conc(row["pm25"], PM25_BREAKPOINTS))
    if not np.isnan(row.get("pm1", np.nan)):
        sub.append(_aqi_from_conc(row["pm1"], PM1_BREAKPOINTS))
    if not np.isnan(row.get("o3", np.nan)):
        sub.append(_aqi_from_conc(row["o3"] / 2.0, O3_BREAKPOINTS))
    if not np.isnan(row.get("no2", np.nan)):
        sub.append(_aqi_from_conc(row["no2"] / 1.88, NO2_BREAKPOINTS))
    return max(sub) if sub else np.nan



def load_pollution(path: Path) -> pd.DataFrame:
    df = pd.read_csv(path, parse_dates=["datetimeUtc"])
    df = df.rename(columns={"datetimeUtc": "timestamp"})
    df["timestamp"] = pd.to_datetime(df["timestamp"], utc=True).dt.tz_localize(None)
    df["hour"] = df["timestamp"].dt.floor("h")

    known = {"pm1", "pm25", "o3", "no2", "so2", "co"}
    df = df[df["parameter"].isin(known)]

    pivot = (
        df.groupby(["hour", "parameter"])["value"]
        .mean()
        .unstack("parameter")
        .reset_index()
    )
    pivot.columns.name = None

    for col in ["pm25", "pm1", "o3", "no2"]:
        if col not in pivot.columns:
            pivot[col] = np.nan

    pivot["aqi"] = pivot.apply(compute_aqi_row, axis=1)

    print(f"  Pollution: {len(pivot):,} hourly rows | "
          f"range {pivot['hour'].min()} → {pivot['hour'].max()}")
    return pivot.rename(columns={"hour": "timestamp"})



def load_weather(path: Path) -> pd.DataFrame:
    df = pd.read_csv(path, parse_dates=["date"])
    df = df.rename(columns={"date": "timestamp"})
    df["timestamp"] = pd.to_datetime(df["timestamp"]).dt.normalize()

    df = df.rename(columns={
        "tavg": "temp_avg_c",
        "tmin": "temp_min_c",
        "tmax": "temp_max_c",
        "prcp": "precip_mm",
        "snow": "snow_mm",
        "wdir": "wind_dir_deg",
        "wspd": "wind_speed_kmh",
        "wpgt": "wind_gust_kmh",
        "pres": "pressure_hpa",
        "tsun": "sunshine_min",
    })

    weather_cols = [
        "temp_avg_c", "temp_min_c", "temp_max_c",
        "precip_mm", "wind_dir_deg", "wind_speed_kmh",
        "pressure_hpa",
    ]
    df = df[["timestamp"] + [c for c in weather_cols if c in df.columns]]

    df = df.sort_values("timestamp")
    for col in df.columns[1:]:
        df[col] = df[col].ffill().bfill()

    hours = pd.DataFrame(
        {"timestamp": pd.date_range(df["timestamp"].min(),
                                    df["timestamp"].max() + pd.Timedelta("23h"),
                                    freq="h")}
    )
    hours["date_key"] = hours["timestamp"].dt.normalize()
    df["date_key"] = df["timestamp"]
    merged = hours.merge(df.drop(columns="timestamp"), on="date_key", how="left")
    merged = merged.drop(columns="date_key")

    print(f"  Weather:   {len(merged):,} hourly rows | "
          f"range {merged['timestamp'].min()} → {merged['timestamp'].max()}")
    return merged



def load_traffic(path: Path) -> pd.DataFrame:
    """
    Traffic spans 2000-present. We extract the cyclic hourly pattern
    (median Vol by hour-of-day × day-of-week) and use it as a feature
    rather than raw timestamps — this bridges the date-range gap cleanly.
    """
    df = pd.read_csv(path, parse_dates=["timestamp"])
    df["timestamp"] = pd.to_datetime(df["timestamp"])
    df["hour_of_day"] = df["timestamp"].dt.hour
    df["day_of_week"]  = df["timestamp"].dt.dayofweek  # 0=Mon

    pattern = (
        df.groupby(["hour_of_day", "day_of_week"])["Vol"]
        .median()
        .reset_index()
        .rename(columns={"Vol": "traffic_vol_median"})
    )

    vmax = pattern["traffic_vol_median"].max()
    vmin = pattern["traffic_vol_median"].min()
    pattern["traffic_intensity"] = (
        (pattern["traffic_vol_median"] - vmin) / (vmax - vmin)
    ).round(4)

    hourly_avg = df.groupby("hour_of_day")["Vol"].mean()
    threshold  = hourly_avg.quantile(0.70)
    rush_hours = set(hourly_avg[hourly_avg >= threshold].index.tolist())

    pattern["is_rush_hour"] = pattern["hour_of_day"].isin(rush_hours).astype(int)

    print(f"Traffic:   cyclic pattern extracted | "
          f"rush hours: {sorted(rush_hours)}")
    return pattern



def merge_all(poll: pd.DataFrame,
              weather: pd.DataFrame,
              traffic_pattern: pd.DataFrame) -> pd.DataFrame:

    date_min = poll["timestamp"].min().normalize()
    date_max = poll["timestamp"].max().normalize() + pd.Timedelta("23h")

    weather = weather[
        (weather["timestamp"] >= date_min) &
        (weather["timestamp"] <= date_max)
    ].copy()

    spine = pd.DataFrame({
        "timestamp": pd.date_range(date_min, date_max, freq="h")
    })

    df = spine.merge(poll, on="timestamp", how="left")

    df = df.merge(weather, on="timestamp", how="left")

    df["hour_of_day"] = df["timestamp"].dt.hour
    df["day_of_week"]  = df["timestamp"].dt.dayofweek
    df = df.merge(traffic_pattern, on=["hour_of_day", "day_of_week"], how="left")

    print(f"  Merged:    {len(df):,} rows | "
          f"range {df['timestamp'].min()} → {df['timestamp'].max()}")
    return df



def engineer_features(df: pd.DataFrame) -> pd.DataFrame:
    df = df.sort_values("timestamp").reset_index(drop=True)

    df["month"] = df["timestamp"].dt.month
    df["is_weekday"] = (df["day_of_week"] < 5).astype(int)

    df["hour_sin"] = np.sin(2 * np.pi * df["hour_of_day"] / 24)
    df["hour_cos"]  = np.cos(2 * np.pi * df["hour_of_day"] / 24)
    df["month_sin"] = np.sin(2 * np.pi * df["month"] / 12)
    df["month_cos"] = np.cos(2 * np.pi * df["month"] / 12)

    if "wind_dir_deg" in df.columns:
        df["wind_dir_sin"] = np.sin(np.deg2rad(df["wind_dir_deg"].fillna(0)))
        df["wind_dir_cos"] = np.cos(np.deg2rad(df["wind_dir_deg"].fillna(0)))

    for lag in [1, 2, 3, 6, 12, 24]:
        df[f"aqi_lag_{lag}h"] = df["aqi"].shift(lag)

    df["aqi_roll6h_mean"]  = df["aqi"].shift(1).rolling(6,  min_periods=1).mean()
    df["aqi_roll24h_mean"] = df["aqi"].shift(1).rolling(24, min_periods=1).mean()
    df["aqi_roll24h_std"]  = df["aqi"].shift(1).rolling(24, min_periods=1).std().fillna(0)

    for pol in ["pm25", "pm1", "o3", "no2"]:
        if pol in df.columns:
            df[f"{pol}_lag1h"] = df[pol].shift(1)

    if "temp_avg_c" in df.columns:
        df["traffic_temp_interact"] = (
            df["traffic_intensity"] * (1 / (df["temp_avg_c"].clip(lower=1) + 10))
        ).round(5)

    before = len(df)
    df = df.dropna(subset=["aqi"]).reset_index(drop=True)
    print(f"  After dropping NaN AQI: {len(df):,} / {before:,} rows kept")

    return df



def run(
    pollution_path: Path = POLLUTION_CSV,
    weather_path: Path   = WEATHER_CSV,
    traffic_path: Path   = TRAFFIC_CSV,
    out_path: Path       = OUT_PATH,
) -> pd.DataFrame:
    print("=" * 55)
    print("  Pollution Cause Analyzer — Preprocessor")
    print("=" * 55)

    print("\nLoading sources:")
    poll    = load_pollution(pollution_path)
    weather = load_weather(weather_path)
    traffic_pattern = load_traffic(traffic_path)

    print("\nMerging:")
    df = merge_all(poll, weather, traffic_pattern)

    print("\nEngineering features:")
    df = engineer_features(df)

    out_path.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(out_path, index=False)
    print(f"\n  Saved → {out_path}")
    print(f"  Shape: {df.shape[0]:,} rows × {df.shape[1]} columns")
    print("=" * 55)
    return df


if __name__ == "__main__":
    run()
