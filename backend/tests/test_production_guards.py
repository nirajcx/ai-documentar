import asyncio
from types import SimpleNamespace

import httpx
from fastapi import FastAPI, Request

from app.core import request_limits


def test_request_limits_cover_declared_and_chunked_bodies(monkeypatch):
    settings = SimpleNamespace(request_max_bytes=8, rate_limit_enabled=False)
    monkeypatch.setattr(request_limits, "get_settings", lambda: settings)
    app = FastAPI()
    app.add_middleware(request_limits.RequestLimitsMiddleware)

    @app.post("/upload")
    async def upload(request: Request):
        return {"size": len(await request.body())}

    async def run():
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test"
        ) as c:
            assert (await c.post("/upload", content=b"123456789")).status_code == 413

            async def chunks():
                yield b"12345"
                yield b"6789"

            assert (await c.post("/upload", content=chunks())).status_code == 413
            assert (await c.post("/upload", content=b"123")).json() == {"size": 3}

    asyncio.run(run())


def test_shared_rate_limit_and_redis_failure(monkeypatch):
    settings = SimpleNamespace(request_max_bytes=1024, rate_limit_enabled=True)
    monkeypatch.setattr(request_limits, "get_settings", lambda: settings)

    class Redis:
        count = 0
        broken = False

        async def eval(self, *args):
            if self.broken:
                raise ConnectionError()
            self.count += 1
            return self.count

    redis = Redis()

    async def get_redis():
        return redis

    monkeypatch.setattr(request_limits, "get_redis", get_redis)
    app = FastAPI()
    app.add_middleware(request_limits.RequestLimitsMiddleware)

    @app.post("/api/v1/auth/login")
    async def login():
        return {"ok": True}

    async def run():
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test"
        ) as c:
            for _ in range(10):
                assert (await c.post("/api/v1/auth/login")).status_code == 200
            response = await c.post("/api/v1/auth/login", headers={"X-Forwarded-For": "different"})
            assert response.status_code == 429 and response.headers["Retry-After"] == "60"
            redis.broken = True
            assert (await c.post("/api/v1/auth/login")).status_code == 503

    asyncio.run(run())


def test_embedding_dimensions_accept_env_string_but_reject_incompatible_index(monkeypatch):
    import pytest
    from pydantic import ValidationError

    from app.core.config import Settings

    monkeypatch.setenv("EMBEDDING_DIMENSIONS", "1024")
    assert Settings(_env_file=None).embedding_dimensions == 1024
    monkeypatch.setenv("EMBEDDING_DIMENSIONS", "768")
    with pytest.raises(ValidationError):
        Settings(_env_file=None)
