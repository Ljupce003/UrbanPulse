import logging
from typing import Optional, Dict, Any
from urllib.parse import urlencode

from fastapi import HTTPException
from torchgen.model import Location

from backend.core.config import get_settings
from backend.models.weather import AirQualityResponse, AirQualityComponents
from backend.services.common.helpers import _cache_get, _http_get_json, _cache_set
from backend.services.weather_service import resolve_city

log = logging.getLogger("urbanpulse.pollution")
_aqi_cache: dict[str, tuple[float, dict]] = {}

def _aqi_index_to_level(aqi_index: int) -> str:
    """Convert AQI index (0-500+) to human-readable level."""
    if aqi_index <= 50:
        return "Good"
    elif aqi_index <= 100:
        return "Fair"
    elif aqi_index <= 150:
        return "Moderate"
    elif aqi_index <= 200:
        return "Poor"
    elif aqi_index <= 300:
        return "Very Poor"
    else:
        return "Hazardous"

def preprocess_air_quality_data(
    payload: Dict[str, Any],
    city_data: Location,           # from resolve_city or _resolve_city_from_coordinates
) -> AirQualityResponse:
    """
    Full preprocessing pipeline for OpenWeatherMap Air Pollution API response.
    Handles missing values, nulls, type conversions, and data validation.
    """

    if not payload or "list" not in payload or not payload["list"]:
        log.error("Invalid or empty pollution payload received")
        raise HTTPException(status_code=502, detail="Invalid pollution data received from provider")

    list_data: Dict = payload["list"][0]

    main = list_data.get("main") or {}
    components = list_data.get("components") or {}
    dt = list_data.get("dt")

    raw_aqi = main.get("aqi")

    if raw_aqi is None:
        log.warning("AQI value is missing from API response")
        aqi_index = 0
    else:
        try:
            if isinstance(raw_aqi, str):
                aqi_map = {"1": 25, "2": 75, "3": 125, "4": 175, "5": 300}
                aqi_index = aqi_map.get(raw_aqi.strip(), 0)
            else:
                aqi_index = int(raw_aqi)
        except (ValueError, TypeError):
            log.warning(f"Invalid AQI value: {raw_aqi}")
            aqi_index = 0

    aqi_level = _aqi_index_to_level(aqi_index)

    def safe_float(value: Any, default: Optional[float] = None) -> Optional[float]:
        """Convert value to float, return None if missing/invalid."""
        if value is None:
            return default
        try:
            return float(value)
        except (ValueError, TypeError):
            log.warning(f"Invalid component value: {value}")
            return default

    processed_components = AirQualityComponents(
        pm2_5=safe_float(components.get("pm2_5")),
        pm10=safe_float(components.get("pm10")),
        o3=safe_float(components.get("o3")),
        no2=safe_float(components.get("no2")),
        so2=safe_float(components.get("so2")),
        co=safe_float(components.get("co")),
    )

    try:
        observed_at = int(dt) if dt is not None else 0
    except (ValueError, TypeError):
        log.warning(f"Invalid timestamp dt: {dt}")
        observed_at = 0

    response = AirQualityResponse(
        location=city_data,
        aqi_index=aqi_index,
        aqi_level=aqi_level,
        components=processed_components,
        observed_at=observed_at,
    )

    return response


def get_current_pollution(
    city: Optional[str] = None,
    country_code: Optional[str] = None,
    lat: Optional[float] = None,
    lon: Optional[float] = None,
) -> AirQualityResponse:
    """
    Fetch air quality data from OpenWeatherMap Air Pollution API with full preprocessing.

    Supports two modes:
    - City mode: city + optional country_code
    - Coordinate mode: lat and lon together
    """
    settings = get_settings()
    if not settings.WEATHER_API_KEY:
        raise HTTPException(status_code=500, detail="Missing WEATHER_API_KEY configuration")

    if city:
        city_data = resolve_city(city=city, country_code=country_code)
        lat = city_data.lat
        lon = city_data.lon
    elif lat is not None and lon is not None:
        from backend.services.weather_service import _resolve_city_from_coordinates
        city_data = _resolve_city_from_coordinates(lat, lon)
    else:
        raise HTTPException(status_code=400, detail="Provide either city or both lat and lon")

    cache_key = f"aqi:{lat}:{lon}"
    cached = _cache_get(_aqi_cache, cache_key, settings.WEATHER_CACHE_TTL_SECONDS)
    if cached:
        return AirQualityResponse(**cached)

    params = {
        "lat": lat,
        "lon": lon,
        "appid": settings.WEATHER_API_KEY,
    }
    url = f"{settings.WEATHER_BASE_URL}/data/2.5/air_pollution?{urlencode(params)}"
    payload = _http_get_json(url, settings.WEATHER_HTTP_TIMEOUT_SECONDS)

    response = preprocess_air_quality_data(payload=payload, city_data=city_data)

    _cache_set(_aqi_cache, cache_key, response.model_dump())

    return response