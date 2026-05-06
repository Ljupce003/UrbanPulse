from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field, model_validator

class PollutionFeatures(BaseModel):
    """
    All features accepted by the analyzer.

    Lag / rolling / interaction features are optional — the service falls
    back to training-set means when they are absent.
    """

    # raw pollutant readings
    pm1: float | None = Field(None, description="PM1 concentration (µg/m³)")
    pm25: float | None = Field(None, description="PM2.5 concentration (µg/m³)")
    aqi: float | None = Field(None, ge=0, description="Current AQI reading")

    # weather
    temp_avg_c: float | None = Field(None, description="Average temperature (°C)")
    temp_min_c: float | None = Field(None, description="Min temperature (°C)")
    temp_max_c: float | None = Field(None, description="Max temperature (°C)")
    precip_mm: float | None = Field(None, ge=0, description="Precipitation (mm)")
    wind_speed_kmh: float | None = Field(None, ge=0, description="Wind speed (km/h)")
    pressure_hpa: float | None = Field(None, description="Atmospheric pressure (hPa)")
    wind_dir_sin: float | None = Field(None, ge=-1, le=1, description="Wind direction sine")
    wind_dir_cos: float | None = Field(None, ge=-1, le=1, description="Wind direction cosine")

    # time
    hour_of_day: int | None = Field(None, ge=0, le=23)
    day_of_week: int | None = Field(None, ge=0, le=6, description="0=Monday … 6=Sunday")
    month: int | None = Field(None, ge=1, le=12)
    is_rush_hour: int | None = Field(None, ge=0, le=1)
    is_weekday: int | None = Field(None, ge=0, le=1)
    hour_sin: float | None = Field(None, ge=-1, le=1)
    hour_cos: float | None = Field(None, ge=-1, le=1)
    month_sin: float | None = Field(None, ge=-1, le=1)
    month_cos: float | None = Field(None, ge=-1, le=1)

    # traffic
    traffic_vol_median: float | None = Field(None, ge=0, description="Median traffic volume")
    traffic_intensity: float | None = Field(None, ge=0, le=1, description="Normalised traffic intensity [0–1]")
    traffic_temp_interact: float | None = Field(None, description="traffic_intensity × temp_avg_c interaction")

    # AQI lags
    aqi_lag_1h: float | None = Field(None, ge=0)
    aqi_lag_2h: float | None = Field(None, ge=0)
    aqi_lag_3h: float | None = Field(None, ge=0)
    aqi_lag_6h: float | None = Field(None, ge=0)
    aqi_lag_12h: float | None = Field(None, ge=0)
    aqi_lag_24h: float | None = Field(None, ge=0)
    aqi_roll6h_mean: float | None = Field(None, ge=0)
    aqi_roll24h_mean: float | None = Field(None, ge=0)
    aqi_roll24h_std: float | None = Field(None, ge=0)

    # pollutant lags
    pm25_lag1h: float | None = Field(None, ge=0)
    pm1_lag1h: float | None = Field(None, ge=0)
    o3_lag1h: float | None = Field(None, ge=0)
    no2_lag1h: float | None = Field(None, ge=0)

    model_config = {"extra": "allow"}

    def to_feature_dict(self) -> dict[str, Any]:
        """Return only explicitly provided (non-None) fields."""
        return {k: v for k, v in self.model_dump().items() if v is not None}


class BatchPredictRequest(BaseModel):
    records: list[PollutionFeatures] = Field(..., min_length=1, max_length=500)


# response schemas
class ContributionItem(BaseModel):
    factor: str
    display: str
    shap_value: float
    pct: float
    direction: str


class AqiCategory(BaseModel):
    category: str
    color: str


class AnalyzeResponse(BaseModel):
    predicted_aqi: float
    aqi_category: AqiCategory
    base_value: float
    dominant_factor: str
    contributions: list[ContributionItem]


class PredictResponse(BaseModel):
    predicted_aqi: float
    aqi_category: AqiCategory


class BatchPredictResponse(BaseModel):
    predictions: list[PredictResponse]
    count: int


class ContributionSummaryItem(BaseModel):
    rank: int
    factor: str
    display: str
    avg_pct: float
    avg_shap: float
    dominant_direction: str
