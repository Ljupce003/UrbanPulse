import logging
from typing import Optional

from fastapi import APIRouter, HTTPException, Query

from backend.services.historical_data_service import get_historical_pollution


log = logging.getLogger("urbanpulse.historical")

router = APIRouter(prefix="/historical", tags=["Historical Data"])


@router.get("/pollution")
async def historical_pollution(
    city: Optional[str] = Query(None),
    country_code: Optional[str] = Query(None),
    lat: Optional[float] = Query(None),
    lon: Optional[float] = Query(None),
):
    """
    Returns hourly pollution history for the last 3 days.
    """
    if not city and not (lat is not None and lon is not None):
        raise HTTPException(400, "Provide city or lat/lon")

    return get_historical_pollution(city, country_code, lat, lon)

