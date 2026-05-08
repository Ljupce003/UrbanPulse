from typing import Optional, Dict, Any

from pydantic import BaseModel


class TrafficTempRequest(BaseModel):
    traffic_vol_median: Optional[float] = None
    temp_avg_c: Optional[float] = None
    temp_min_c: Optional[float] = None
    temp_max_c: Optional[float] = None
    overrides: Optional[Dict[str, Any]] = None


class PollutionTempRequest(BaseModel):
    aqi: Optional[float] = None
    pm25: Optional[float] = None
    pm1: Optional[float] = None
    overrides: Optional[Dict[str, Any]] = None