import os
from functools import lru_cache
from supabase import create_client, Client
from dotenv import load_dotenv
from dataclasses import dataclass

load_dotenv()


@dataclass(frozen=True)
class Settings:
    SUPABASE_URL: str = os.getenv("SUPABASE_URL", "")
    SUPABASE_ANON_KEY: str = os.getenv("SUPABASE_ANON_KEY", "")
    SUPABASE_SERVICE_ROLE_KEY: str = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
    JWT_SECRET: str = os.getenv("JWT_SECRET", "")
    FRONTEND_URL: str = os.getenv("FRONTEND_URL")
    app_name: str = os.getenv("APP_NAME", "UrbanPulse API")
    api_prefix: str = os.getenv("API_PREFIX", "/api")


@lru_cache()
def get_settings() -> Settings:
    s = Settings()
    missing = [k for k, v in vars(s).items() if not v]
    if missing:
        print(f"[WARN] Missing env vars: {missing}")
    return s


def get_supabase_admin() -> Client:
    settings = get_settings()
    return create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY)


settings = Settings()
