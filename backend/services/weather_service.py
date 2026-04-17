import logging
from typing import Optional
from urllib.parse import urlencode

from fastapi import HTTPException

from backend.core.config import get_settings, get_supabase_admin
from backend.models.weather import (
    CityLocation,
    WeatherCurrentResponse,
    WeatherCondition,
    WeatherMain,
    WeatherWind,
    CityRecord,
    CityUpsertRequest,
    CityPatchRequest,
)
from backend.services.common.helpers import _http_get_json, _cache_get, _cache_set

log = logging.getLogger("urbanpulse.weather")

_city_cache: dict[str, tuple[float, CityLocation]] = {}
_weather_cache: dict[str, tuple[float, dict]] = {}


def _normalize_city(name: str) -> str:
    return " ".join(name.strip().lower().split())


def _clear_weather_caches():
    _city_cache.clear()
    _weather_cache.clear()


def _city_row_to_location(row: dict) -> CityLocation:
    return CityLocation(
        city=row["name"],
        country_code=row.get("country_code"),
        state=row.get("state"),
        lat=float(row["lat"]),
        lon=float(row["lon"]),
    )


def _city_row_to_record(row: dict) -> CityRecord:
    return CityRecord(
        id=int(row["id"]),
        city=row["name"],
        country_code=row.get("country_code"),
        state=row.get("state"),
        lat=float(row["lat"]),
        lon=float(row["lon"]),
        population_rank=int(row.get("population_rank", 999999)),
        source=row.get("source", "unknown"),
    )


def _execute_data(query):
    response = query.execute()
    return getattr(response, "data", None) if response is not None else None


def _get_city_row_by_id(city_id: int) -> dict:
    supabase = get_supabase_admin()
    row = _execute_data(
        supabase.table("city_locations")
        .select("id, name, country_code, state, lat, lon, population_rank, source")
        .eq("id", city_id)
        .maybe_single()
    )
    if not row:
        raise HTTPException(status_code=404, detail="City not found")
    if isinstance(row, list):
        row = row[0] if row else None
    if not row:
        raise HTTPException(status_code=404, detail="City not found")
    return row


def _resolve_city_from_db(city: str, country_code: Optional[str]) -> Optional[CityLocation]:
    supabase = get_supabase_admin()
    normalized = _normalize_city(city)

    query = (
        supabase.table("city_locations")
        .select("name, country_code, state, lat, lon")
        .eq("name_normalized", normalized)
    )
    if country_code:
        query = query.eq("country_code", country_code.upper())

    result = query.order("population_rank", desc=False).limit(1).execute()
    row = result.data[0] if result.data else None
    if not row:
        return None

    return _city_row_to_location(row)


def _upsert_city_to_db(city: CityLocation):
    supabase = get_supabase_admin()
    payload = {
        "name": city.city,
        "name_normalized": _normalize_city(city.city),
        "country_code": city.country_code,
        "state": city.state,
        "lat": city.lat,
        "lon": city.lon,
        "source": "openweather",
    }
    supabase.table("city_locations").upsert(
        payload,
        on_conflict="name_normalized,country_code",
    ).execute()


def _resolve_city_from_openweather(city: str, country_code: Optional[str]) -> CityLocation:
    settings = get_settings()
    if not settings.WEATHER_API_KEY:
        raise HTTPException(status_code=500, detail="Missing WEATHER_API_KEY configuration")

    q = city
    if country_code:
        q = f"{city},{country_code.upper()}"

    params = {
        "q": q,
        "limit": settings.WEATHER_GEOCODE_LIMIT,
        "appid": settings.WEATHER_API_KEY,
    }
    url = f"{settings.WEATHER_BASE_URL}/geo/1.0/direct?{urlencode(params)}"
    data = _http_get_json(url, settings.WEATHER_HTTP_TIMEOUT_SECONDS)

    if not data:
        raise HTTPException(status_code=404, detail="City not found")

    first = data[0]
    return CityLocation(
        city=first["name"],
        country_code=first.get("country"),
        state=first.get("state"),
        lat=float(first["lat"]),
        lon=float(first["lon"]),
    )


def resolve_city(city: str, country_code: Optional[str] = None) -> CityLocation:
    settings = get_settings()
    cache_key = f"city:{_normalize_city(city)}:{(country_code or '').upper()}"
    cached = _cache_get(_city_cache, cache_key, settings.WEATHER_CACHE_TTL_SECONDS)
    if cached:
        return cached

    city_data = _resolve_city_from_db(city, country_code)
    if city_data is None:
        city_data = _resolve_city_from_openweather(city, country_code)
        _upsert_city_to_db(city_data)

    _cache_set(_city_cache, cache_key, city_data)
    return city_data


def _resolve_city_from_coordinates(lat: float, lon: float) -> CityLocation:
    settings = get_settings()
    if not settings.WEATHER_API_KEY:
        raise HTTPException(status_code=500, detail="Missing WEATHER_API_KEY configuration")

    params = {
        "lat": lat,
        "lon": lon,
        "limit": 1,
        "appid": settings.WEATHER_API_KEY,
    }
    url = f"{settings.WEATHER_BASE_URL}/geo/1.0/reverse?{urlencode(params)}"
    data = _http_get_json(url, settings.WEATHER_HTTP_TIMEOUT_SECONDS)

    if not data:
        return CityLocation(city="Unknown", lat=lat, lon=lon)

    first = data[0]
    return CityLocation(
        city=first.get("name", "Unknown"),
        country_code=first.get("country"),
        state=first.get("state"),
        lat=lat,
        lon=lon,
    )


def preprocess_weather_data(
    payload: dict,
    city_data: CityLocation,
    effective_units: str,
) -> WeatherCurrentResponse:
    """
    Preprocessing pipeline for weather data.
    Handles missing values, nulls, type conversions, and validation.
    """
    if not payload:
        log.error("Invalid or empty weather payload received")
        raise HTTPException(status_code=502, detail="Invalid weather data received from provider")

    weather_info = (payload.get("weather") or [{}])[0]
    main_info = payload.get("main") or {}
    wind_info = payload.get("wind") or {}

    def safe_float(value: any, default: float = 0.0) -> float:
        if value is None:
            return default
        try:
            return float(value)
        except (ValueError, TypeError):
            log.warning(f"Invalid float value: {value}")
            return default

    def safe_int(value: any, default: int = 0) -> int:
        if value is None:
            return default
        try:
            return int(value)
        except (ValueError, TypeError):
            log.warning(f"Invalid int value: {value}")
            return default

    response = WeatherCurrentResponse(
        location=city_data,
        weather=WeatherCondition(
            main=weather_info.get("main", "unknown"),
            description=weather_info.get("description", "unknown"),
            icon=weather_info.get("icon", "01d"),
        ),
        main=WeatherMain(
            temp=safe_float(main_info.get("temp")),
            feels_like=safe_float(main_info.get("feels_like")),
            temp_min=safe_float(main_info.get("temp_min")),
            temp_max=safe_float(main_info.get("temp_max")),
            pressure=safe_int(main_info.get("pressure")),
            humidity=safe_int(main_info.get("humidity")),
        ),
        wind=WeatherWind(
            speed=safe_float(wind_info.get("speed")),
            deg=wind_info.get("deg"),
        ),
        visibility=payload.get("visibility"),
        observed_at=safe_int(payload.get("dt")),
        timezone_offset=safe_int(payload.get("timezone")),
    )

    return response


def get_current_weather(
    city: Optional[str] = None,
    country_code: Optional[str] = None,
    lat: Optional[float] = None,
    lon: Optional[float] = None,
    units: Optional[str] = None,
) -> WeatherCurrentResponse:
    """
    Fetch current weather from OpenWeatherMap with full preprocessing pipeline.
    """
    settings = get_settings()
    if not settings.WEATHER_API_KEY:
        raise HTTPException(status_code=500, detail="Missing WEATHER_API_KEY configuration")

    if city:
        city_data = resolve_city(city=city, country_code=country_code)
        lat = city_data.lat
        lon = city_data.lon
    elif lat is not None and lon is not None:
        city_data = _resolve_city_from_coordinates(lat, lon)
    else:
        raise HTTPException(status_code=400, detail="Provide either city or both lat and lon")

    effective_units = units or settings.WEATHER_UNITS
    weather_cache_key = f"weather:{lat}:{lon}:{effective_units}"
    cached = _cache_get(_weather_cache, weather_cache_key, settings.WEATHER_CACHE_TTL_SECONDS)
    if cached:
        return WeatherCurrentResponse(**cached)

    params = {
        "lat": lat,
        "lon": lon,
        "units": effective_units,
        "appid": settings.WEATHER_API_KEY,
    }
    url = f"{settings.WEATHER_BASE_URL}/data/2.5/weather?{urlencode(params)}"
    payload = _http_get_json(url, settings.WEATHER_HTTP_TIMEOUT_SECONDS)

    response = preprocess_weather_data(
        payload=payload,
        city_data=city_data,
        effective_units=effective_units,
    )

    _cache_set(_weather_cache, weather_cache_key, response.model_dump())
    return response


def list_cached_cities(country_code: Optional[str] = None, limit: int = 30) -> list[CityLocation]:
    supabase = get_supabase_admin()
    query = supabase.table("city_locations").select("name, country_code, state, lat, lon")
    if country_code:
        query = query.eq("country_code", country_code.upper())

    rows = _execute_data(query.order("population_rank", desc=False).limit(limit)) or []
    return [_city_row_to_location(row) for row in rows]


def create_city(payload: CityUpsertRequest) -> CityRecord:
    supabase = get_supabase_admin()
    normalized_name = _normalize_city(payload.city)
    normalized_country = payload.country_code.upper() if payload.country_code else None

    existing_rows = _execute_data(
        supabase.table("city_locations")
        .select("id")
        .eq("name_normalized", normalized_name)
        .eq("country_code", normalized_country)
        .limit(1)
    ) or []
    if existing_rows:
        raise HTTPException(status_code=409, detail="City already exists for this country")

    insert_payload = {
        "name": payload.city,
        "name_normalized": normalized_name,
        "country_code": normalized_country,
        "state": payload.state,
        "lat": payload.lat,
        "lon": payload.lon,
        "population_rank": payload.population_rank,
        "source": "manual",
    }
    insert_response = supabase.table("city_locations").insert(insert_payload).execute()
    created = getattr(insert_response, "data", None) if insert_response is not None else None

    if not created:
        created = _execute_data(
            supabase.table("city_locations")
            .select("id, name, country_code, state, lat, lon, population_rank, source")
            .eq("name_normalized", normalized_name)
            .eq("country_code", normalized_country)
            .order("id", desc=True)
            .limit(1)
        )

    if not created:
        raise HTTPException(status_code=500, detail="Failed to create city")

    if isinstance(created, dict):
        created = [created]

    _clear_weather_caches()
    return _city_row_to_record(created[0])


def update_city_partial(city_id: int, payload: CityPatchRequest) -> CityRecord:
    updates = payload.model_dump(exclude_unset=True)
    if not updates:
        raise HTTPException(status_code=400, detail="At least one field must be provided")

    current = _get_city_row_by_id(city_id)

    if "city" in updates:
        updates["name"] = updates.pop("city")
        updates["name_normalized"] = _normalize_city(updates["name"])

    if "country_code" in updates and updates["country_code"] is not None:
        updates["country_code"] = updates["country_code"].upper()

    supabase = get_supabase_admin()
    final_name_normalized = updates.get("name_normalized", _normalize_city(current["name"]))
    final_country = updates.get("country_code", current.get("country_code"))

    conflict_rows = _execute_data(
        supabase.table("city_locations")
        .select("id")
        .eq("name_normalized", final_name_normalized)
        .eq("country_code", final_country)
        .neq("id", city_id)
        .limit(1)
    ) or []
    if conflict_rows:
        raise HTTPException(status_code=409, detail="Another city already uses this name/country")

    updated = _execute_data(
        supabase.table("city_locations").update(updates).eq("id", city_id)
    )
    if not updated:
        updated = _execute_data(
            supabase.table("city_locations")
            .select("id, name, country_code, state, lat, lon, population_rank, source")
            .eq("id", city_id)
            .limit(1)
        )
    if not updated:
        raise HTTPException(status_code=500, detail="Failed to update city")

    if isinstance(updated, dict):
        updated = [updated]

    _clear_weather_caches()
    return _city_row_to_record(updated[0])


def delete_city(city_id: int) -> dict:
    _get_city_row_by_id(city_id)
    supabase = get_supabase_admin()
    deleted = _execute_data(
        supabase.table("city_locations").delete().eq("id", city_id)
    )
    if not deleted:
        if _execute_data(
            supabase.table("city_locations").select("id").eq("id", city_id).limit(1)
        ):
            raise HTTPException(status_code=500, detail="Failed to delete city")

    _clear_weather_caches()
    return {"message": "City deleted", "city_id": city_id}