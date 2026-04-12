from pydantic import BaseModel, Field
from typing import Optional


class CityLocation(BaseModel):
    city: str
    country_code: Optional[str] = None
    state: Optional[str] = None
    lat: float
    lon: float


class WeatherMain(BaseModel):
    temp: float
    feels_like: float
    temp_min: float
    temp_max: float
    pressure: int
    humidity: int


class WeatherWind(BaseModel):
    speed: float
    deg: Optional[int] = None


class WeatherCondition(BaseModel):
    main: str
    description: str
    icon: str


class WeatherCurrentResponse(BaseModel):
    source: str = Field(default="openweather")
    location: CityLocation
    weather: WeatherCondition
    main: WeatherMain
    wind: WeatherWind
    visibility: Optional[int] = None
    observed_at: int
    timezone_offset: int


class CityUpsertRequest(BaseModel):
    city: str = Field(min_length=2)
    country_code: Optional[str] = Field(default=None, min_length=2, max_length=2)
    state: Optional[str] = None
    lat: float = Field(ge=-90, le=90)
    lon: float = Field(ge=-180, le=180)
    population_rank: int = Field(default=999999, ge=1)


class CityPatchRequest(BaseModel):
    city: Optional[str] = Field(default=None, min_length=2)
    country_code: Optional[str] = Field(default=None, min_length=2, max_length=2)
    state: Optional[str] = None
    lat: Optional[float] = Field(default=None, ge=-90, le=90)
    lon: Optional[float] = Field(default=None, ge=-180, le=180)
    population_rank: Optional[int] = Field(default=None, ge=1)


class CityRecord(BaseModel):
    id: int
    city: str
    country_code: Optional[str] = None
    state: Optional[str] = None
    lat: float
    lon: float
    population_rank: int
    source: str


class CityDeleteResponse(BaseModel):
    message: str
    city_id: int


