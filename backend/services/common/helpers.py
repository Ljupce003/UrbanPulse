import json
import logging
import math
import time
from typing import Optional
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

from fastapi import HTTPException

from backend.core.config import get_settings, get_supabase_admin
from backend.models.traffic import RoutePoint, TrafficRoute, TrafficScoreResponse

log = logging.getLogger("urbanpulse.traffic")
_traffic_cache: dict[str, tuple[float, dict]] = {}

def _normalize_city(name: str) -> str:
    return " ".join(name.strip().lower().split())


def _resolve_city_from_db_only(city: str, country_code: Optional[str]) -> tuple[RoutePoint, str, Optional[str]]:
    supabase = get_supabase_admin()
    query = (
        supabase.table("city_locations")
        .select("name, country_code, lat, lon")
        .eq("name_normalized", _normalize_city(city))
    )
    if country_code:
        query = query.eq("country_code", country_code.upper())

    result = query.order("population_rank", desc=False).limit(1).execute()
    rows = getattr(result, "data", None) or []
    if not rows:
        raise HTTPException(
            status_code=404,
            detail="City not found in city_locations. Add it via /api/weather/cities first.",
        )

    first = rows[0]
    point = RoutePoint(lat=float(first["lat"]), lon=float(first["lon"]))
    return point, first["name"], first.get("country_code")


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


def _execute_data(query):
    response = query.execute()
    return getattr(response, "data", None) if response is not None else None
