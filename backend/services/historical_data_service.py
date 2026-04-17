import json
import logging
import time
from typing import Optional
from urllib.request import urlopen, Request
from urllib.error import HTTPError, URLError

from fastapi import HTTPException

from backend.core.config import get_settings
from backend.services.weather_service import resolve_city

log = logging.getLogger("urbanpulse.historical")

_cache: dict[str, tuple[float, dict]] = {}

HISTORY_DAYS = 3

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
            body = exc.read().decode("utf-8", errors="ignore")
            log.error("OpenWeather error %s: %s", exc.code, body)
            raise HTTPException(status_code=exc.code, detail=body)
    except URLError:
        raise HTTPException(status_code=503, detail="Service unavailable")


def _resolve_location(city: Optional[str], country_code: Optional[str], lat: Optional[float], lon: Optional[float]):
    """
    Resolves city metadata and coordinates from either city name or coordinates.
    """
    if city:
        city_data = resolve_city(city=city, country_code=country_code)
        return city_data, city_data.lat, city_data.lon

    if lat is not None and lon is not None:
        from backend.services.weather_service import _resolve_city_from_coordinates
        city_data = _resolve_city_from_coordinates(lat, lon)
        return city_data, lat, lon

    raise HTTPException(status_code=400, detail="Provide city or lat/lon")



def _normalize_pollution(p: dict) -> dict:
    comp = p.get("components") or {}
    return {
        "timestamp": p.get("dt"),
        "aqi": (p.get("main") or {}).get("aqi"),
        "pm2_5": comp.get("pm2_5"),
        "pm10": comp.get("pm10"),
        "no2": comp.get("no2"),
        "o3": comp.get("o3"),
    }

def get_historical_pollution(city: Optional[str] = None, country_code: Optional[str] = None,
                             lat: Optional[float] = None, lon: Optional[float] = None) -> dict:
    """
    Returns hourly pollution history for the last 3 days.
    """
    settings = get_settings()
    city_data, lat, lon = _resolve_location(city, country_code, lat, lon)

    now = int(time.time())
    start = now - HISTORY_DAYS * 24 * 60 * 60

    cache_key = f"pollution:{lat}:{lon}:{start}"
    cached = _cache_get(_cache, cache_key, settings.HISTORY_CACHE_TTL_SECONDS)
    if cached:
        return cached

    url = (
        f"{settings.WEATHER_BASE_URL}/data/2.5/air_pollution/history"
        f"?lat={lat}&lon={lon}&start={start}&end={now}"
        f"&appid={settings.WEATHER_API_KEY}"
    )

    payload = _http_get_json(url, settings.WEATHER_HTTP_TIMEOUT_SECONDS)
    data = [_normalize_pollution(p) for p in payload.get("list", [])]

    result = {
        "location": city_data.model_dump() if hasattr(city_data, "model_dump") else vars(city_data),
        "start": start,
        "end": now,
        "data": data,
    }

    _cache_set(_cache, cache_key, result)
    return result

# TODO implement fetching historical hourly data of the lasy 3 days regarding weather and traffic info

