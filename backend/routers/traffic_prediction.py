import logging
from pathlib import Path
from datetime import datetime
from typing import Dict, Any

import numpy as np
import pandas as pd
from fastapi import APIRouter
from pydantic import BaseModel

from ..services.ml.traffic_pred_service import get_rmse, get_r2, predict, get_model
from ..services.weather_service import get_current_weather

logger = logging.getLogger("traffic_prediction_router")

router = APIRouter(prefix="/traffic-prediction", tags=["Traffic Prediction"])


class TrafficPredictionResponse(BaseModel):
    predicted_traffic_volume: float
    traffic_level: str
    rmse: float
    r2: float
    traffic_vol_median: float
    used_latest_row_as_base: bool
    weather: Dict[str, Any]
    message: str


def get_traffic_level(volume: float) -> str:
    if volume < 70:
        return "low"
    elif volume < 130:
        return "medium"
    elif volume < 150:
        return "high"
    else:
        return "very_high"


@router.get("/predict-next-hour", response_model=TrafficPredictionResponse)
async def predict_next_hour(
        city: str = "Prague",
        country_code: str = "CZ",
        lat: float | None = None,
        lon: float | None = None,
):
    data_path = (
            Path(__file__).resolve().parents[2]
            / "data" / "processed" / "imputed_dataset.csv"
    )

    df = pd.read_csv(data_path)
    latest_row = df.iloc[-1].to_dict()

    weather_response = get_current_weather(
        city=city,
        country_code=country_code,
        lat=lat,
        lon=lon,
        units="metric"
    )

    now = datetime.now()
    traffic_vol_median = float(df["traffic_vol_median"].median())

    input_data = latest_row.copy()

    input_data.update({
        "hour_of_day": (now.hour + 1) % 24,
        "day_of_week": now.weekday(),
        "month": now.month,
        "is_weekday": int(now.weekday() < 5),
        "is_rush_hour": 1 if (now.hour + 1) % 24 in [7, 8, 9, 16, 17, 18] else 0,

        "temp_avg_c": weather_response.main.temp,
        "temp_min_c": weather_response.main.temp_min,
        "temp_max_c": weather_response.main.temp_max,
        "pressure_hpa": weather_response.main.pressure,
        "wind_speed_kmh": round(weather_response.wind.speed * 3.6, 2),
        "precip_mm": getattr(weather_response.weather, 'rain', 0)
        if hasattr(weather_response.weather, 'rain') else 0,

        "traffic_vol_median": traffic_vol_median,
        "traffic_temp_interact": traffic_vol_median * weather_response.main.temp,

        "hour_sin": np.sin(2 * np.pi * (now.hour + 1) % 24 / 24),
        "hour_cos": np.cos(2 * np.pi * (now.hour + 1) % 24 / 24),
        "month_sin": np.sin(2 * np.pi * now.month / 12),
        "month_cos": np.cos(2 * np.pi * now.month / 12),
    })

    wind_deg = getattr(weather_response.wind, 'deg', 0)
    input_data["wind_dir_sin"] = np.sin(np.deg2rad(wind_deg))
    input_data["wind_dir_cos"] = np.cos(np.deg2rad(wind_deg))

    input_data.pop("timestamp", None)

    model = get_model()
    feature_names = model.feature_name_
    final_input = {col: float(input_data[col]) for col in feature_names if col in input_data}

    predicted_traffic = predict(final_input)
    traffic_level = get_traffic_level(predicted_traffic)

    return TrafficPredictionResponse(
        predicted_traffic_volume=round(float(predicted_traffic), 2),
        traffic_level=traffic_level,
        rmse=round(float(get_rmse()), 4),
        r2=round(float(get_r2()), 4),
        traffic_vol_median=round(traffic_vol_median, 2),
        used_latest_row_as_base=True,
        weather={
            "source": weather_response.source,
            "location": str(weather_response.location),
            "condition": getattr(weather_response.weather, "main", str(weather_response.weather)),
            "temp_c": weather_response.main.temp,
            "humidity": weather_response.main.humidity,
            "wind_speed_kmh": round(weather_response.wind.speed * 3.6, 1),
            "pressure_hpa": weather_response.main.pressure,
        },
        message="Traffic volume prediction for the next hour"
    )