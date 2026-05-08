from pydantic import BaseModel, Field

class TrafficPollutionRequest(BaseModel):
    traffic_vol_median: float = Field(..., ge=0, description="Vehicles per interval")
    traffic_intensity: float = Field(..., ge=0.0, le=1.0, description="Normalised traffic intensity [0-1]")
    is_rush_hour: bool = Field(..., description="Whether it is rush hour")
    temp_avg_c: float = Field(..., ge=-30, le=50, description="Average temperature in °C")


class TrafficPollutionResponse(BaseModel):
    aqi: float
    pm25: float | None


class PollutionTemperatureRequest(BaseModel):
    aqi: float = Field(..., ge=0, description="Air Quality Index")
    pm25: float = Field(..., ge=0, description="PM2.5 concentration in µg/m³")
    pm1: float = Field(..., ge=0, description="PM1 concentration in µg/m³")


class PollutionTemperatureResponse(BaseModel):
    temp_avg_c: float