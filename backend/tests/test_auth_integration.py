import asyncio
import os
from datetime import datetime, timedelta

import httpx
import pytest
from fastapi import FastAPI
from sqlalchemy import select
from test_conversations import setup as conversation_setup

from app.api.routes import auth
from app.core.config import get_settings
from app.db.models.session import AuthSession
from app.db.models.user import User
from app.db.session import get_session

setup = conversation_setup
pytestmark = pytest.mark.skipif(
    not os.environ.get("TEST_DATABASE_URL"), reason="Needs test database"
)


def test_auth_revocation_expiry_account_status_and_secure_cookie(setup, monkeypatch):
    app = FastAPI()
    app.include_router(auth.router, prefix="/api/v1")

    async def db():
        async with setup.sessions() as session:
            yield session

    app.dependency_overrides[get_session] = db
    monkeypatch.setattr(get_settings(), "environment", "production")

    async def run():
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="https://test"
        ) as c:
            response = await c.post(
                "/api/v1/auth/register",
                json={
                    "username": "securetest",
                    "email": "secure@example.com",
                    "password": "Test-only-long-password!",
                },
            )
            assert response.status_code == 201

            async def login():
                response = await c.post(
                    "/api/v1/auth/login",
                    json={"email": "secure@example.com", "password": "Test-only-long-password!"},
                )
                assert response.status_code == 200
                assert "Secure" in response.headers["set-cookie"]
                return response.json()["session_token"]

            token = await login()
            assert (await c.get("/api/v1/auth/me")).status_code == 200
            # Bearer logout revokes the same token that authenticated the request.
            c.cookies.clear()
            headers = {"Authorization": "Bearer " + token}
            assert (await c.post("/api/v1/auth/logout", headers=headers)).status_code == 200
            assert (await c.get("/api/v1/auth/me", headers=headers)).status_code == 401
            token = await login()
            async with setup.sessions() as session:
                row = await session.scalar(
                    select(AuthSession).where(AuthSession.session_token == token)
                )
                row.expires_at = datetime.utcnow() - timedelta(seconds=1)
                await session.commit()
            assert (await c.get("/api/v1/auth/me")).status_code == 401
            token = await login()
            async with setup.sessions() as session:
                user = await session.scalar(select(User).where(User.email == "secure@example.com"))
                user.is_active = False
                await session.commit()
            assert (await c.get("/api/v1/auth/me")).status_code == 401

    asyncio.run(run())
