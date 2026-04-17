from backend.ml.recommendations.prompt.create_prompt import create_prompt
from backend.ml.recommendations.services.config import AgentConfig
from backend.ml.recommendations.services.openai_agent import LLMAgent
from backend.models import TrafficScoreResponse
from backend.models.weather import AirQualityResponse, WeatherCurrentResponse


def get_recommendation_from_llm(air_quality_data: AirQualityResponse,
                   traffic_data: TrafficScoreResponse,
                   weather_data: WeatherCurrentResponse) -> str:
    """
    Generates daily travel and outdoor activity recommendations by querying an LLM
    based on current air quality, traffic, and weather conditions.

    Args:
        air_quality_data (AirQualityResponse): Current air quality metrics including AQI value,
            category, and main pollutant.
        traffic_data (TrafficScoreResponse): Current traffic conditions including congestion
            level and average speed.
        weather_data (WeatherCurrentResponse): Current weather conditions including temperature,
            humidity, and description.

    Returns:
        str: A natural language response from the LLM containing personalized recommendations
            for outdoor activity, travel timing, transport mode, and health precautions.
    """

    agent_config = AgentConfig()
    agent = LLMAgent(agent_config)

    query = create_prompt(air_quality_data, traffic_data, weather_data)

    agent_response = agent.query_llm(query)

    return agent_response