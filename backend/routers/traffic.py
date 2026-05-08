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
    # Allow combinations: explicit coordinates may be provided alongside city

    # Validate partial coordinates for start/end
    if (start_lat is None) != (start_lon is None):
        raise HTTPException(status_code=400, detail="Provide both start_lat and start_lon together when specifying a start point")
    if (end_lat is None) != (end_lon is None):
        raise HTTPException(status_code=400, detail="Provide both end_lat and end_lon together when specifying an end point")

    # Resolve precedence:
    # - If explicit full route provided (start+end) -> use that (ignore city)
    # - If explicit start+end not provided but city provided and one of start/end is provided,
    #   use city as the missing endpoint (e.g., city as origin or destination)
    # - If only city provided -> city mode
    # - If nothing provided -> backend default route

    use_start = start_lat is not None and start_lon is not None
    use_end = end_lat is not None and end_lon is not None

    resolved_start_lat = None
    resolved_start_lon = None
    resolved_end_lat = None
    resolved_end_lon = None

    if use_start and use_end:
        # Full explicit route
        resolved_start_lat = start_lat
        resolved_start_lon = start_lon
        resolved_end_lat = end_lat
        resolved_end_lon = end_lon
        resolved_city = None
    elif city and not (use_start or use_end):
        # Pure city mode
        resolved_city = city
    elif city and (use_start or use_end):
        # City + partial route: fill missing endpoint(s) with city
        resolved_city = None
        if use_start and not use_end:
            # start provided, city as end
            resolved_start_lat = start_lat
            resolved_start_lon = start_lon
            resolved_end_lat = None
            resolved_end_lon = None
            # get_traffic_score will resolve destination from city when end coords are None
            # pass city separately so service can resolve end from city
            return get_traffic_score(
                city=city,
                country_code=country_code,
                start_lat=resolved_start_lat,
                start_lon=resolved_start_lon,
                end_lat=None,
                end_lon=None,
            )
        elif use_end and not use_start:
            # end provided, city as start
            resolved_end_lat = end_lat
            resolved_end_lon = end_lon
            return get_traffic_score(
                city=city,
                country_code=country_code,
                start_lat=None,
                start_lon=None,
                end_lat=resolved_end_lat,
                end_lon=resolved_end_lon,
            )
        else:
            # shouldn't reach here
            resolved_city = city
    else:
        # No city; if any coords provided they must be full start+end or start+end optional per empty request
        if use_start and not use_end:
            # Start provided but no end -> invalid
            raise HTTPException(status_code=400, detail="Provide both start and end coordinates together or include a city")
        if use_end and not use_start:
            raise HTTPException(status_code=400, detail="Provide both start and end coordinates together or include a city")
        resolved_city = None

    return get_traffic_score(
        city=resolved_city,
        country_code=country_code,
        start_lat=resolved_start_lat,
        start_lon=resolved_start_lon,
        end_lat=resolved_end_lat,
        end_lon=resolved_end_lon,
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
        # Allow explicit start coordinates to override city origin. Validate pairs below.
        pass

    if (start_lat is None) != (start_lon is None):
        raise HTTPException(status_code=400, detail="Provide both start_lat and start_lon together")

    return get_traffic_score_auto_route(
        city=city,
        country_code=country_code,
        start_lat=start_lat,
        start_lon=start_lon,
        distance_m=distance_m,
        bearing_deg=bearing_deg,
    )


