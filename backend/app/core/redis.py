from typing import Optional
import redis.asyncio as redis
from app.core.config import get_settings

redis_client: Optional[redis.Redis] = None


async def get_redis() -> Optional[redis.Redis]:
    """Retrieve the shared Redis client instance."""
    return redis_client


async def init_redis() -> None:
    """Initialize Redis client connection during application startup."""
    global redis_client
    settings = get_settings()
    try:
        redis_client = await redis.from_url(
            settings.redis_url.get_secret_value(),
            encoding="utf-8",
            decode_responses=True,
        )
        await redis_client.ping()
    except Exception as e:
        print(f"⚠️ Redis connection warning: {e}. Running with fail-open fallback.")


async def close_redis() -> None:
    """Safely terminate Redis client connection during application shutdown."""
    global redis_client
    if redis_client:
        await redis_client.aclose()
        redis_client = None
