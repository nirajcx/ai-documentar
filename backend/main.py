from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.router import api_router
from app.core.config import get_settings
from app.core.logging import configure_logging
from app.core.redis import close_redis, init_redis
from app.core.request_limits import RequestLimitsMiddleware


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: initialize Redis connection
    await init_redis()
    yield
    # Shutdown: gracefully close Redis connection
    await close_redis()


settings = get_settings()
configure_logging(settings.log_level)

app = FastAPI(
    title="AI-Documenter API",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(RequestLimitsMiddleware)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,  # Crucial for HttpOnly cookies across origins
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "Cookie"],
)

app.include_router(api_router, prefix="/api/v1")
