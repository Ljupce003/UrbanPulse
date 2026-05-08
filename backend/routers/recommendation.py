from typing import Optional

from fastapi import APIRouter, Query, HTTPException

from backend.services.pollution_service import get_current_pollution
from backend.services.weather_service import get_current_weather, resolve_city
from backend.services.traffic_service import get_traffic_score, get_traffic_score_auto_route
from backend.services.ml.recommendation_service import get_recommendation_from_llm

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
    # Allow combined inputs:
    # - city/country resolves weather + pollution location
    # - route coordinates resolve traffic route
    # - if city is not provided, lat/lon can be used for weather + pollution
    if city is None and (lat is None or lon is None):
        raise HTTPException(
            status_code=400,
            detail="Provide either city/country or both lat and lon for the recommendation location."
        )

    if (lat is None) != (lon is None):
        raise HTTPException(
            status_code=400,
            detail="Provide both lat and lon together when using coordinates."
        )

    if (start_lat is None) != (start_lon is None):
        raise HTTPException(
            status_code=400,
            detail="Provide both start_lat and start_lon together for traffic routing."
        )

    if (end_lat is None) != (end_lon is None):
        raise HTTPException(
            status_code=400,
            detail="Provide both end_lat and end_lon together for traffic routing."
        )

    weather_city = city
    weather_country_code = country_code
    weather_lat = None if city else lat
    weather_lon = None if city else lon

    city_location = None
    if city:
        city_location = resolve_city(city=city, country_code=country_code)

    try:

        air_quality_data: AirQualityResponse = get_current_pollution(
            city=weather_city,
            country_code=weather_country_code,
            lat=weather_lat,
            lon=weather_lon
        )


        weather_data: WeatherCurrentResponse = get_current_weather(
            city=weather_city,
            country_code=weather_country_code,
            lat=weather_lat,
            lon=weather_lon,
            units=units
        )


        # Resolve traffic separately so city metadata and route coordinates do not conflict.
        if start_lat is not None and start_lon is not None and end_lat is not None and end_lon is not None:
            traffic_data: TrafficScoreResponse = get_traffic_score(
                start_lat=start_lat,
                start_lon=start_lon,
                end_lat=end_lat,
                end_lon=end_lon,
            )
        elif city_location and end_lat is not None and end_lon is not None:
            traffic_data = get_traffic_score(
                start_lat=city_location.lat,
                start_lon=city_location.lon,
                end_lat=end_lat,
                end_lon=end_lon,
            )
        elif city_location and start_lat is not None and start_lon is not None:
            traffic_data = get_traffic_score(
                start_lat=start_lat,
                start_lon=start_lon,
                end_lat=city_location.lat,
                end_lon=city_location.lon,
            )
        elif city:
            traffic_data = get_traffic_score(city=city, country_code=country_code)
        elif start_lat is not None and start_lon is not None:
            # No city selected; generate a short route from the explicit start point.
            traffic_data = get_traffic_score_auto_route(
                start_lat=start_lat,
                start_lon=start_lon,
            )
        else:
            traffic_data = get_traffic_score_auto_route()


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