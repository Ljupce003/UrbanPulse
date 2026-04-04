import os
from dataclasses import dataclass


@dataclass(frozen=True)
class Settings:
    app_name: str = os.getenv("APP_NAME", "UrbanPulse API")
    api_prefix: str = os.getenv("API_PREFIX", "/api")


settings = Settings()

