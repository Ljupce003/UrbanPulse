import sys

import os
import logging
import hypercorn.asyncio
import asyncio
from hypercorn.config import Config

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from backend.routers.auth import router as auth_router, log
from backend.routers import status_router, weather_router, pollution_router, traffic_router
from backend.routers.recommendation import router as recommendations_router

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s — %(message)s",
    datefmt="%H:%M:%S",
    stream=sys.stdout,
    force=True,
)
# uncomment for more specific debugging, wouldnt recommend
# logging.getLogger("urbanpulse").setLevel(logging.DEBUG)
# logging.getLogger("uvicorn.error").setLevel(logging.INFO)
# logging.getLogger("uvicorn.access").setLevel(logging.INFO)

app = FastAPI(title="UrbanPulse API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def log_requests(request: Request, call_next):
    log.info(f"→  {request.method:7s}  {request.url.path}")
    response = await call_next(request)
    log.info(f"←  {response.status_code}      {request.url.path}")
    return response


app.include_router(auth_router)
app.include_router(status_router, prefix="/api")
app.include_router(weather_router, prefix="/api")
app.include_router(pollution_router, prefix="/api")
app.include_router(traffic_router, prefix="/api")
app.include_router(recommendations_router, prefix="/api")

@app.get("/")
def root():
    return {"message": "UrbanPulse API is running"}


@app.get("/health")
async def health():
    routes = sorted([r.path for r in app.routes if hasattr(r, "path")])
    return {"status": "ok", "routes": routes}


if __name__ == "__main__":
    config = Config()
    config.bind = ["127.0.0.1:8080"]
    config.loglevel = "debug"

    asyncio.run(hypercorn.asyncio.serve(app, config))
