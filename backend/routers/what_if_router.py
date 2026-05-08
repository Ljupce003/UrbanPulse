from fastapi import APIRouter, HTTPException

from backend.models.what_if import TrafficPollutionResponse, TrafficPollutionRequest, PollutionTemperatureResponse, \
    PollutionTemperatureRequest
from backend.services.ml.what_if_service import (
    run_traffic_pollution_simulation,
    run_pollution_temperature_simulation,
)

router = APIRouter(prefix="/simulator", tags=["simulator"])


@router.post("/traffic-to-pollution", response_model=TrafficPollutionResponse)
def simulate_traffic_to_pollution(body: TrafficPollutionRequest):
    """
    Adjust traffic volume, intensity, rush hour, and temperature
    to see the estimated impact on AQI and PM2.5.
    """
    try:
        return run_traffic_pollution_simulation(
            traffic_vol_median=body.traffic_vol_median,
            traffic_intensity=body.traffic_intensity,
            is_rush_hour=body.is_rush_hour,
            temp_avg_c=body.temp_avg_c,
        )
    except FileNotFoundError as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/pollution-to-temperature", response_model=PollutionTemperatureResponse)
def simulate_pollution_to_temperature(body: PollutionTemperatureRequest):
    """
    Adjust AQI, PM2.5, and PM1 levels to see the estimated
    impact on average temperature.
    """
    try:
        return run_pollution_temperature_simulation(
            aqi=body.aqi,
            pm25=body.pm25,
            pm1=body.pm1,
        )
    except FileNotFoundError as e:
        raise HTTPException(status_code=500, detail=str(e))