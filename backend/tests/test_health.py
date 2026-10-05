import asyncio

import httpx

from main import app


def test_health_and_explicit_development_cors():
    async def check():
        # ASGI transport runs without PostgreSQL, Redis, MinIO or Ollama.
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test"
        ) as client:
            response = await client.get(
                "/api/v1/health", headers={"Origin": "http://localhost:3000"}
            )
            assert response.status_code == 200
            assert response.json() == {"status": "ok"}
            assert response.headers["access-control-allow-origin"] == "http://localhost:3000"
            rejected = await client.get(
                "/api/v1/health", headers={"Origin": "https://untrusted.invalid"}
            )
            assert "access-control-allow-origin" not in rejected.headers

    asyncio.run(check())
