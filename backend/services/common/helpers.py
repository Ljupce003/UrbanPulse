import json
import logging
import time
from typing import Optional
from urllib.parse import urlencode
from urllib.request import urlopen, Request
from urllib.error import HTTPError, URLError

from fastapi import HTTPException

log = logging.getLogger("urbanpulse")

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
            log.error("Provider returned 401 Unauthorized: %s", detail)
            raise HTTPException(status_code=502, detail="Provider rejected the API key")
        if exc.code == 404:
            raise HTTPException(status_code=404, detail="Requested location/route not found")
        if exc.code == 429:
            raise HTTPException(status_code=429, detail="Provider rate limit reached")
        log.warning("HTTP error %s: %s", exc.code, detail)
        raise HTTPException(status_code=502, detail="Failed to fetch data")
    except URLError as exc:
        log.warning("Network error: %s", exc)
        raise HTTPException(status_code=503, detail="Service temporarily unavailable")