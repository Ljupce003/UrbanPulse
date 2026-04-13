import json
import logging
import time
from typing import Optional
from urllib.parse import urlencode
from urllib.request import urlopen, Request
from urllib.error import HTTPError, URLError

from fastapi import HTTPException

from backend.core.config import get_settings
from backend.models.weather import AirQualityResponse, AirQualityComponents
from backend.services.weather_service import resolve_city

log = logging.getLogger("urbanpulse.pollution")
_aqi_cache: dict[str, tuple[float, dict]] = {}


def _cache_get(cache: dict, key: str, ttl_seconds: int):
    entry = cache.get(key)
    if not entry:
        return None
    created_at, value = entry
    if time.time() - created_at > ttl_seconds:
        cache.pop(key, None)
        return None
    return value


def _cache_set(cache: dict, key: str, value):
    cache[key] = (time.time(), value)


def _http_get_json(url: str, timeout_seconds: int) -> dict:
    req = Request(url=url, headers={"Accept": "application/json"}, method="GET")
    try:
        with urlopen(req, timeout=timeout_seconds) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="ignore")
        if exc.code == 401:
            raise HTTPException(status_code=502, detail="Pollution provider rejected the API key")
        if exc.code == 404:
            raise HTTPException(status_code=404, detail="Requested location not found")
        if exc.code == 429:
            raise HTTPException(status_code=429, detail="Pollution provider rate limit reached")
        log.warning("Pollution HTTP error %s: %s", exc.code, detail)
        raise HTTPException(status_code=502, detail="Failed to fetch pollution data")
    except URLError as exc:
        log.warning("Pollution network error: %s", exc)
        raise HTTPException(status_code=503, detail="Pollution service temporarily unavailable")


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


def get_current_pollution(
    city: Optional[str] = None,
    country_code: Optional[str] = None,
    lat: Optional[float] = None,
    lon: Optional[float] = None,
) -> AirQualityResponse:
    """
    Fetch air quality data from OpenWeatherMap Air Pollution API.

    Supports two modes:
    - City mode: city + optional country_code
    - Coordinate mode: lat and lon together
    """
    settings = get_settings()
    if not settings.WEATHER_API_KEY:
        raise HTTPException(status_code=500, detail="Missing WEATHER_API_KEY configuration")

    # Resolve location
    if city:
        city_data = resolve_city(city=city, country_code=country_code)
        lat = city_data.lat
        lon = city_data.lon
    elif lat is not None and lon is not None:
        from backend.services.weather_service import _resolve_city_from_coordinates
        city_data = _resolve_city_from_coordinates(lat, lon)
    else:
        raise HTTPException(status_code=400, detail="Provide either city or both lat and lon")

    # Check cache
    cache_key = f"aqi:{lat}:{lon}"
    cached = _cache_get(_aqi_cache, cache_key, settings.WEATHER_CACHE_TTL_SECONDS)
    if cached:
        return AirQualityResponse(**cached)

    # Fetch from OpenWeatherMap Air Pollution API
    params = {
        "lat": lat,
        "lon": lon,
        "appid": settings.WEATHER_API_KEY,
    }
    url = f"{settings.WEATHER_BASE_URL}/data/2.5/air_pollution?{urlencode(params)}"
    payload = _http_get_json(url, settings.WEATHER_HTTP_TIMEOUT_SECONDS)

    # Parse response
    list_data = (payload.get("list") or [{}])[0]
    main = list_data.get("main") or {}
    components = list_data.get("components") or {}

    aqi_index = main.get("aqi", 0)
    if isinstance(aqi_index, str):
        # OpenWeather sometimes returns aqi as string (1-5 scale)
        aqi_map = {"1": 25, "2": 75, "3": 125, "4": 175, "5": 300}
        aqi_index = aqi_map.get(aqi_index, 0)

    aqi_level = _aqi_index_to_level(aqi_index)

    response = AirQualityResponse(
        location=city_data,
        aqi_index=int(aqi_index),
        aqi_level=aqi_level,
        components=AirQualityComponents(
            pm2_5=components.get("pm2_5"),
            pm10=components.get("pm10"),
            o3=components.get("o3"),
            no2=components.get("no2"),
            so2=components.get("so2"),
            co=components.get("co"),
        ),
        observed_at=int(list_data.get("dt", 0)),
    )

    _cache_set(_aqi_cache, cache_key, response.model_dump())
    return response

