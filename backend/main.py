from fastapi import FastAPI

from backend.core import settings
from backend.routers import status_router

app = FastAPI(title=settings.app_name)
app.include_router(status_router, prefix=settings.api_prefix)


@app.get("/")
def root():
    return {"message": "API is running"}