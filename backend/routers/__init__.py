from .status import router as status_router
from .weather import router as weather_router
from .pollution import router as pollution_router
from .traffic import router as traffic_router

__all__ = ["status_router", "weather_router", "pollution_router", "traffic_router"]

