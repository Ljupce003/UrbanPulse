from typing import Optional

from fastapi import APIRouter, HTTPException, Query

from backend.models.traffic import TrafficScoreResponse
from backend.services.traffic_service import get_traffic_score, get_traffic_score_auto_route


router = APIRouter(prefix="/traffic", tags=["traffic"])


@router.get("/score", response_model=TrafficScoreResponse)
def read_traffic_score(
    city: Optional[str] = Query(default=None, min_length=2, description="City name to resolve from city_locations table."),
    country_code: Optional[str] = Query(default=None, min_length=2, max_length=2, description="Optional ISO-2 country code used with city mode."),
    start_lat: Optional[float] = Query(default=None, ge=-90, le=90, description="Route origin latitude for coordinate mode."),
    start_lon: Optional[float] = Query(default=None, ge=-180, le=180, description="Route origin longitude for coordinate mode."),
    end_lat: Optional[float] = Query(default=None, ge=-90, le=90, description="Route destination latitude for coordinate mode."),
    end_lon: Optional[float] = Query(default=None, ge=-180, le=180, description="Route destination longitude for coordinate mode."),
):
    """
    Compute traffic score from a full route.

    Modes:
    - City mode: provide `city` (+ optional `country_code`) and route is built around that city.
    - Coordinate mode: provide all of `start_lat,start_lon,end_lat,end_lon`.
    - Empty request: uses default route from backend env.
    """
    if city and any(v is not None for v in [start_lat, start_lon, end_lat, end_lon]):
        raise HTTPException(status_code=400, detail="Use city or explicit route coordinates, not both")

    if not city:
        supplied = [start_lat, start_lon, end_lat, end_lon]
        if any(v is not None for v in supplied) and any(v is None for v in supplied):
            raise HTTPException(status_code=400, detail="Provide start_lat,start_lon,end_lat,end_lon together")

    return get_traffic_score(
        city=city,
        country_code=country_code,
        start_lat=start_lat,
        start_lon=start_lon,
        end_lat=end_lat,
        end_lon=end_lon,
    )


@router.get("/score/auto", response_model=TrafficScoreResponse)
def read_traffic_score_auto(
    city: Optional[str] = Query(default=None, min_length=2, description="City name to resolve from city_locations table."),
    country_code: Optional[str] = Query(default=None, min_length=2, max_length=2, description="Optional ISO-2 country code used with city mode."),
    start_lat: Optional[float] = Query(default=None, ge=-90, le=90, description="Origin latitude for coordinate mode."),
    start_lon: Optional[float] = Query(default=None, ge=-180, le=180, description="Origin longitude for coordinate mode."),
    distance_m: float = Query(default=500.0, ge=100.0, le=5000.0, description="Generated destination distance from origin in meters."),
    bearing_deg: float = Query(default=90.0, ge=0.0, le=360.0, description="Direction for generated destination: 0=north, 90=east, 180=south, 270=west."),
):
    """
    Compute traffic score from an auto-generated short route.

    Modes:
    - City mode: provide `city` (+ optional `country_code`), origin comes from city_locations.
    - Coordinate mode: provide `start_lat` and `start_lon`.
    - Empty request: uses default start point from backend env.

    Destination is generated from origin using `distance_m` and `bearing_deg`.
    """
    if city and (start_lat is not None or start_lon is not None):
        raise HTTPException(status_code=400, detail="Use city or start_lat/start_lon, not both")

    if not city and ((start_lat is None) != (start_lon is None)):
        raise HTTPException(status_code=400, detail="Provide both start_lat and start_lon together")

    return get_traffic_score_auto_route(
        city=city,
        country_code=country_code,
        start_lat=start_lat,
        start_lon=start_lon,
        distance_m=distance_m,
        bearing_deg=bearing_deg,
    )


