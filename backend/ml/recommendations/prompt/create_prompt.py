from backend.models import TrafficScoreResponse
from backend.models.weather import AirQualityResponse, WeatherCurrentResponse


def create_prompt (air_quality_data : AirQualityResponse,
                   traffic_data : TrafficScoreResponse,
                   weather_data : WeatherCurrentResponse) -> str:

    prompt = f"""Current conditions in {weather_data.location.city}:

    Weather: {weather_data.weather.description}, {weather_data.main.temp}°C 
    (feels like {weather_data.main.feels_like}°C), 
    wind {weather_data.wind.speed} m/s, 
    visibility {weather_data.visibility if weather_data.visibility else 'unknown'}m.
    Air Quality: {air_quality_data.aqi_level} (AQI {air_quality_data.aqi_index})
    Traffic: {traffic_data.traffic_level} ({traffic_data.traffic_score:.1f}/10)

    Give practical advice for the user today regarding:
    - Whether they should go for a walk or hike
    - Whether they should travel by car
    - Whether they should stay indoors
    - Whether they should wear sunglasses
    - Or similar advice.

    Be direct, honest, and helpful. Explain your reasoning briefly and write 2-3 short sentences in total.
    """
    return prompt


