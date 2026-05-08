# backend/core/routers/scenario_simulator.py
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, Dict, Any

from backend.models.what_if import TrafficTempRequest, PollutionTempRequest
from backend.services.ml.what_if_service import (
    simulate_traffic_to_pollution,
    simulate_pollution_to_temp,
    initialize_with_latest_data
)

router = APIRouter(prefix="/scenario-simulator", tags=["Scenario Simulator"])

@router.post("/initialize-latest")
def api_initialize_latest():
    """Force reload latest data from imputed_dataset.csv"""
    try:
        result = initialize_with_latest_data()
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/traffic-to-pollution")
def api_traffic_to_pollution(request: TrafficTempRequest):
    """Traffic & Temperature → Pollution Impact"""
    try:
        initialize_with_latest_data()

        result = simulate_traffic_to_pollution(
            traffic_vol_median=request.traffic_vol_median,
            temp_avg_c=request.temp_avg_c,
            temp_min_c=request.temp_min_c,
            temp_max_c=request.temp_max_c,
            **(request.overrides or {})
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/pollution-to-temp")
def api_pollution_to_temp(request: PollutionTempRequest):
    """Pollution → Temperature Impact"""
    try:
        initialize_with_latest_data()

        result = simulate_pollution_to_temp(
            aqi=request.aqi,
            pm25=request.pm25,
            pm1=request.pm1,
            **(request.overrides or {})
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))