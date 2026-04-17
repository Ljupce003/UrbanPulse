from typing import Optional

from fastapi import APIRouter, Query, HTTPException

from backend.services.pollution_service import get_current_pollution
from backend.services.weather_service import get_current_weather
from backend.services.traffic_service import get_traffic_score
from backend.services.recommendation_service import get_recommendation_from_llm

from backend.models.weather import AirQualityResponse
from backend.models import TrafficScoreResponse, WeatherCurrentResponse


router = APIRouter(prefix="/recommendations", tags=["recommendations"])

@router.get("/daily", response_model=str)
def get_daily_recommendations(

    city: Optional[str] = Query(default=None, min_length=2, description="City name (e.g. Skopje)"),
    country_code: Optional[str] = Query(
        default=None, min_length=2, max_length=2, description="ISO Alpha-2 country code (e.g. MK)"
    ),
    lat: Optional[float] = Query(default=None, ge=-90, le=90, description="Latitude"),
    lon: Optional[float] = Query(default=None, ge=-180, le=180, description="Longitude"),


    start_lat: Optional[float] = Query(
        default=None, ge=-90, le=90, description="Start latitude for traffic route"
    ),
    start_lon: Optional[float] = Query(
        default=None, ge=-180, le=180, description="Start longitude for traffic route"
    ),
    end_lat: Optional[float] = Query(
        default=None, ge=-90, le=90, description="End latitude for traffic route (optional)"
    ),
    end_lon: Optional[float] = Query(
        default=None, ge=-180, le=180, description="End longitude for traffic route (optional)"
    ),


    units: Optional[str] = Query(
        default="metric",
        description="Temperature units: metric, imperial, or standard"
    ),
):
    """
    Get personalized daily travel and outdoor activity recommendations using LLM.

    Combines current air quality, traffic conditions, and weather data.

    Modes for location:
    - City mode: city + optional country_code
    - Coordinate mode: lat + lon
    """

    if city and (lat is not None or lon is not None):
        raise HTTPException(
            status_code=400,
            detail="Use either city (with optional country_code) or lat+lon, not both."
        )

    if not city and ((lat is None) != (lon is None)):
        raise HTTPException(
            status_code=400,
            detail="Provide both lat and lon together when using coordinates."
        )

    if not city and lat is None and not (start_lat and start_lon):
        raise HTTPException(
            status_code=400,
            detail="Provide at least city or lat+lon or start_lat+start_lon."
        )

    try:

        air_quality_data: AirQualityResponse = get_current_pollution(
            city=city,
            country_code=country_code,
            lat=lat,
            lon=lon
        )


        weather_data: WeatherCurrentResponse = get_current_weather(
            city=city,
            country_code=country_code,
            lat=lat,
            lon=lon,
            units=units
        )


        traffic_data: TrafficScoreResponse = get_traffic_score(
            city=city,
            country_code=country_code,
            start_lat=start_lat or lat,
            start_lon=start_lon or lon,
            end_lat=end_lat,
            end_lon=end_lon
        )


        recommendation: str = get_recommendation_from_llm(
            air_quality_data=air_quality_data,
            traffic_data=traffic_data,
            weather_data=weather_data
        )

        return recommendation

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to generate recommendation: {str(e)}"
        )