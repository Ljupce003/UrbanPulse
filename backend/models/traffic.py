from typing import Optional

from pydantic import BaseModel, Field


class RoutePoint(BaseModel):
    lat: float = Field(ge=-90, le=90, description="Latitude", examples=[41.9995])
    lon: float = Field(ge=-180, le=180, description="Longitude", examples=[21.4170])


class TrafficRoute(BaseModel):
    origin: RoutePoint
    destination: RoutePoint


class TrafficScoreResponse(BaseModel):
    source: str = Field(default="locationiq", description="Traffic data provider")
    location_city: Optional[str] = Field(default=None, description="Resolved city when city/default mode is used")
    location_country_code: Optional[str] = Field(default=None, description="Resolved country code when available")
    route: TrafficRoute
    distance_m: float = Field(description="Route distance in meters")
    duration_s: float = Field(description="Estimated duration in seconds")
    speed_kmh: float = Field(description="Derived average speed for route")
    free_flow_kmh: float = Field(default=50.0, description="Free-flow benchmark speed")
    traffic_score: float = Field(description="Traffic score normalized to 0..10")
    traffic_level: str = Field(description="Traffic level label: Heavy Traffic / Moderate Traffic / Free Flow")
    traffic_color: str = Field(description="Traffic color bucket: red / yellow / green")
    observed_at: int = Field(description="Unix timestamp of score generation")

