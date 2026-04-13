from typing import Optional

from fastapi import APIRouter, Query, HTTPException

from backend.models.weather import AirQualityResponse
from backend.services.pollution_service import get_current_pollution

router = APIRouter(prefix="/pollution", tags=["pollution"])


@router.get("/current", response_model=AirQualityResponse)
def read_current_pollution(
    city: Optional[str] = Query(default=None, min_length=2),
    country_code: Optional[str] = Query(default=None, min_length=2, max_length=2),
    lat: Optional[float] = Query(default=None, ge=-90, le=90),
    lon: Optional[float] = Query(default=None, ge=-180, le=180),
):
    """
    Get current air quality data by city or coordinates.

    Modes (use exactly one):
    - City mode: city + optional country_code
    - Coordinate mode: lat and lon together
    """
    if city and (lat is not None or lon is not None):
        raise HTTPException(status_code=400, detail="Use city or lat/lon, not both")

    if not city and ((lat is None) != (lon is None)):
        raise HTTPException(status_code=400, detail="Provide both lat and lon together")

    return get_current_pollution(city=city, country_code=country_code, lat=lat, lon=lon)

