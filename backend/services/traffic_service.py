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
            raise HTTPException(status_code=502, detail="Traffic provider rejected the API key")
        if exc.code == 404:
            raise HTTPException(status_code=404, detail="Traffic route not found")
        if exc.code == 429:
            raise HTTPException(status_code=429, detail="Traffic provider rate limit reached")
        log.warning("Traffic HTTP error %s: %s", exc.code, detail)
        raise HTTPException(status_code=502, detail="Failed to fetch traffic data")
    except URLError as exc:
        log.warning("Traffic network error: %s", exc)
        raise HTTPException(status_code=503, detail="Traffic service temporarily unavailable")


def _derive_level(score: float) -> tuple[str, str]:
    if score <= 4.0:
        return "Heavy Traffic", "red"
    if score <= 7.0:
        return "Moderate Traffic", "yellow"
    return "Free Flow", "green"


def _calculate_score(distance_m: float, duration_s: float, free_flow_kmh: float) -> tuple[float, float]:
    if duration_s <= 0:
        raise HTTPException(status_code=502, detail="Traffic provider returned invalid route duration")

    speed_kmh = (distance_m / duration_s) * 3.6
    raw_score = (speed_kmh / free_flow_kmh) * 10.0
    clamped_score = max(0.0, min(10.0, raw_score))
    return round(speed_kmh, 1), round(clamped_score, 1)


def _build_city_route(city: str, country_code: Optional[str]) -> tuple[RoutePoint, RoutePoint, str, Optional[str]]:
    settings = get_settings()
    city_point, city_name, city_country = _resolve_city_from_db_only(city=city, country_code=country_code)

    origin = RoutePoint(
        lat=city_point.lat + settings.TRAFFIC_CITY_ROUTE_ORIGIN_DELTA_LAT,
        lon=city_point.lon + settings.TRAFFIC_CITY_ROUTE_ORIGIN_DELTA_LON,
    )
    destination = RoutePoint(
        lat=city_point.lat + settings.TRAFFIC_CITY_ROUTE_DEST_DELTA_LAT,
        lon=city_point.lon + settings.TRAFFIC_CITY_ROUTE_DEST_DELTA_LON,
    )
    return origin, destination, city_name, city_country


def _build_coordinates_route(
    start_lat: Optional[float],
    start_lon: Optional[float],
    end_lat: Optional[float],
    end_lon: Optional[float],
) -> tuple[RoutePoint, RoutePoint]:
    settings = get_settings()
    supplied = [start_lat, start_lon, end_lat, end_lon]
    if all(v is None for v in supplied):
        return (
            RoutePoint(lat=settings.TRAFFIC_DEFAULT_START_LAT, lon=settings.TRAFFIC_DEFAULT_START_LON),
            RoutePoint(lat=settings.TRAFFIC_DEFAULT_END_LAT, lon=settings.TRAFFIC_DEFAULT_END_LON),
        )

    if any(v is None for v in supplied):
        raise HTTPException(
            status_code=400,
            detail="Provide start_lat,start_lon,end_lat,end_lon together",
        )

    return (
        RoutePoint(lat=float(start_lat), lon=float(start_lon)),
        RoutePoint(lat=float(end_lat), lon=float(end_lon)),
    )


def _offset_point_by_distance(lat: float, lon: float, distance_m: float, bearing_deg: float) -> RoutePoint:
    earth_radius_m = 6371000.0
    angular_distance = distance_m / earth_radius_m
    bearing_rad = math.radians(bearing_deg)
    lat1 = math.radians(lat)
    lon1 = math.radians(lon)

    sin_lat2 = (
        math.sin(lat1) * math.cos(angular_distance)
        + math.cos(lat1) * math.sin(angular_distance) * math.cos(bearing_rad)
    )
    lat2 = math.asin(max(-1.0, min(1.0, sin_lat2)))
    lon2 = lon1 + math.atan2(
        math.sin(bearing_rad) * math.sin(angular_distance) * math.cos(lat1),
        math.cos(angular_distance) - math.sin(lat1) * math.sin(lat2),
    )

    lon2_deg = (math.degrees(lon2) + 540.0) % 360.0 - 180.0
    lat2_deg = math.degrees(lat2)
    return RoutePoint(lat=lat2_deg, lon=lon2_deg)


def get_traffic_score(
    city: Optional[str] = None,
    country_code: Optional[str] = None,
    start_lat: Optional[float] = None,
    start_lon: Optional[float] = None,
    end_lat: Optional[float] = None,
    end_lon: Optional[float] = None,
) -> TrafficScoreResponse:
    settings = get_settings()
    if not settings.LOCATIONIQ_API_KEY:
        raise HTTPException(status_code=500, detail="Missing LOCATIONIQ_API_KEY configuration")

    if city and any(v is not None for v in [start_lat, start_lon, end_lat, end_lon]):
        raise HTTPException(status_code=400, detail="Use city or explicit route coordinates, not both")

    location_city = None
    location_country_code = None
    if city:
        origin, destination, location_city, location_country_code = _build_city_route(city, country_code)
    else:
        origin, destination = _build_coordinates_route(start_lat, start_lon, end_lat, end_lon)
        if all(v is None for v in [start_lat, start_lon, end_lat, end_lon]):
            location_city = "Skopje"
            location_country_code = "MK"

    route_key = (
        f"traffic:{origin.lon:.5f},{origin.lat:.5f};"
        f"{destination.lon:.5f},{destination.lat:.5f}"
    )
    cached = _cache_get(_traffic_cache, route_key, settings.TRAFFIC_CACHE_TTL_SECONDS)
    if cached:
        return TrafficScoreResponse(**cached)

    base = settings.LOCATIONIQ_DIRECTIONS_BASE_URL.rstrip("/")
    path = f"{origin.lon},{origin.lat};{destination.lon},{destination.lat}"
    query = urlencode({"key": settings.LOCATIONIQ_API_KEY, "overview": "false"})
    url = f"{base}/{path}?{query}"

    payload = _http_get_json(url, settings.TRAFFIC_HTTP_TIMEOUT_SECONDS)
    route = (payload.get("routes") or [{}])[0]
    distance_m = float(route.get("distance", 0.0))
    duration_s = float(route.get("duration", 0.0))
    if distance_m <= 0 or duration_s <= 0:
        raise HTTPException(status_code=502, detail="Traffic provider returned incomplete route data")

    speed_kmh, score = _calculate_score(distance_m, duration_s, settings.TRAFFIC_FREE_FLOW_KMH)
    level, color = _derive_level(score)

    response = TrafficScoreResponse(
        location_city=location_city,
        location_country_code=location_country_code,
        route=TrafficRoute(origin=origin, destination=destination),
        distance_m=round(distance_m, 1),
        duration_s=round(duration_s, 1),
        speed_kmh=speed_kmh,
        free_flow_kmh=settings.TRAFFIC_FREE_FLOW_KMH,
        traffic_score=score,
        traffic_level=level,
        traffic_color=color,
        observed_at=int(time.time()),
    )

    _cache_set(_traffic_cache, route_key, response.model_dump())
    return response


def get_traffic_score_auto_route(
    city: Optional[str] = None,
    country_code: Optional[str] = None,
    start_lat: Optional[float] = None,
    start_lon: Optional[float] = None,
    distance_m: float = 500.0,
    bearing_deg: float = 90.0,
) -> TrafficScoreResponse:
    if city and (start_lat is not None or start_lon is not None):
        raise HTTPException(status_code=400, detail="Use city or start_lat/start_lon, not both")

    if not city and ((start_lat is None) != (start_lon is None)):
        raise HTTPException(status_code=400, detail="Provide both start_lat and start_lon together")

    if city:
        city_point, city_name, city_country = _resolve_city_from_db_only(city=city, country_code=country_code)
        origin = RoutePoint(lat=city_point.lat, lon=city_point.lon)
    elif start_lat is not None and start_lon is not None:
        origin = RoutePoint(lat=float(start_lat), lon=float(start_lon))
        city_name = None
        city_country = None
    else:
        settings = get_settings()
        origin = RoutePoint(
            lat=settings.TRAFFIC_DEFAULT_START_LAT,
            lon=settings.TRAFFIC_DEFAULT_START_LON,
        )
        city_name = "Skopje"
        city_country = "MK"

    destination = _offset_point_by_distance(
        lat=origin.lat,
        lon=origin.lon,
        distance_m=distance_m,
        bearing_deg=bearing_deg,
    )

    response = get_traffic_score(
        city=None,
        start_lat=origin.lat,
        start_lon=origin.lon,
        end_lat=destination.lat,
        end_lon=destination.lon,
    )
    response.location_city = city_name
    response.location_country_code = city_country
    return response


