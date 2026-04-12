from typing import Optional

from fastapi import APIRouter, Query, HTTPException, Depends

from backend.core.dependencies import require_admin
from backend.models.weather import (
    CityLocation,
    WeatherCurrentResponse,
    CityUpsertRequest,
    CityPatchRequest,
    CityRecord,
    CityDeleteResponse,
)
from backend.services.weather_service import (
    get_current_weather,
    list_cached_cities,
    create_city,
    update_city_partial,
    delete_city,
)


router = APIRouter(prefix="/weather", tags=["weather"])


@router.get("/current", response_model=WeatherCurrentResponse)
def read_current_weather(
    city: Optional[str] = Query(default=None, min_length=2),
    country_code: Optional[str] = Query(default=None, min_length=2, max_length=2),
    lat: Optional[float] = Query(default=None, ge=-90, le=90),
    lon: Optional[float] = Query(default=None, ge=-180, le=180),
    units: str = Query(default="metric", pattern="^(standard|metric|imperial)$"),
):
    if city and (lat is not None or lon is not None):
        # Keep request semantics deterministic.
        raise HTTPException(status_code=400, detail="Use city or lat/lon, not both")

    if not city and ((lat is None) != (lon is None)):
        raise HTTPException(status_code=400, detail="Provide both lat and lon together")

    return get_current_weather(city=city, country_code=country_code, lat=lat, lon=lon, units=units)


@router.get("/cities", response_model=list[CityLocation])
def read_cached_cities(
    country_code: Optional[str] = Query(default=None, min_length=2, max_length=2),
    limit: int = Query(default=30, ge=1, le=200),
):
    return list_cached_cities(country_code=country_code, limit=limit)


@router.post("/cities", response_model=CityRecord)
def create_city_record(payload: CityUpsertRequest, _: dict = Depends(require_admin)):
    return create_city(payload)


@router.patch("/cities/{city_id}", response_model=CityRecord)
def update_city_record(city_id: int, payload: CityPatchRequest, _: dict = Depends(require_admin)):
    return update_city_partial(city_id, payload)


@router.delete("/cities/{city_id}", response_model=CityDeleteResponse)
def delete_city_record(city_id: int, _: dict = Depends(require_admin)):
    return delete_city(city_id)


