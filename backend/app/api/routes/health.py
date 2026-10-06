from typing import Literal

from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(tags=["health"])


class HealthResponse(BaseModel):
    status: Literal["ok"] = "ok"


@router.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    """Liveness only: deliberately does not probe any external service."""
    return HealthResponse()


@router.get("/ready")
async def readiness():
    """Dependency readiness, separate from liveness; no credentials or endpoints exposed."""
    import asyncio
    import time

    from fastapi.responses import JSONResponse
    from sqlalchemy import text

    from app.core.config import get_settings
    from app.core.redis import get_redis
    from app.db.session import SessionLocal
    from app.services.llm.embedding_service import EmbeddingService
    from app.services.storage.s3_service import S3Service

    checks = {}

    async def database():
        async with SessionLocal() as db:
            version = await db.scalar(text("SELECT version_num FROM alembic_version"))
            vector = await db.scalar(text("SELECT 1 FROM pg_extension WHERE extname='vector'"))
            if version != "0004_citation_snapshots" or not vector:
                raise RuntimeError("Migration required")

    async def queue():
        redis = await get_redis()
        if redis is None:
            raise RuntimeError("Redis unavailable")
        await redis.ping()
        if get_settings().rag_enabled:
            last = await redis.get("documentar:dispatcher:heartbeat")
            if not last or time.time() - float(last) > 120:
                raise RuntimeError("Worker/scheduler heartbeat stale")

    async def storage():
        service = S3Service()
        await asyncio.to_thread(service.client.head_bucket, Bucket=service.bucket)

    async def embeddings():
        await EmbeddingService().digest()

    async def probe(name, operation):
        try:
            await asyncio.wait_for(operation(), timeout=5)
            checks[name] = "ok"
        except Exception:
            checks[name] = "unavailable"

    operations = [("database", database), ("queue", queue)]
    if get_settings().rag_enabled:
        operations.extend([("storage", storage), ("embedding_model", embeddings)])
    await asyncio.gather(*(probe(name, op) for name, op in operations))
    ready = all(value == "ok" for value in checks.values())
    return JSONResponse(
        {"status": "ready" if ready else "unavailable", "checks": checks},
        status_code=200 if ready else 503,
    )
