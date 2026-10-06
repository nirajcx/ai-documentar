"""Bound request bodies and optionally share API throttles across replicas via Redis."""

import hashlib
import time

from starlette.exceptions import HTTPException
from starlette.responses import JSONResponse

from app.core.config import get_settings
from app.core.redis import get_redis

COUNTER = """
local count = redis.call('INCR', KEYS[1])
if count == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
return count
"""


class RequestTooLarge(HTTPException):
    def __init__(self):
        super().__init__(413, "Request exceeds upload limit.")


class RequestLimitsMiddleware:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        settings = get_settings()
        headers = dict(scope.get("headers", []))
        try:
            declared = int(headers.get(b"content-length", b"0"))
        except ValueError:
            return await JSONResponse({"detail": "Invalid content length."}, 400)(
                scope, receive, send
            )
        if declared > settings.request_max_bytes:
            return await JSONResponse({"detail": "Request exceeds upload limit."}, 413)(
                scope, receive, send
            )
        path = scope["path"]
        if (
            settings.rate_limit_enabled
            and path.startswith("/api/v1/")
            and path not in {"/api/v1/health", "/api/v1/ready"}
            and scope["method"] != "OPTIONS"
        ):
            # Client IP comes from ASGI, never arbitrary X-Forwarded-For. Only
            # trust configured reverse-proxy addresses at the server boundary.
            identity = (scope.get("client") or ("unknown",))[0]
            auth = path in {"/api/v1/auth/login", "/api/v1/auth/register"}
            limit = 10 if auth else 240
            key = "documentar:rate:" + hashlib.sha256(identity.encode()).hexdigest()
            key += f":{int(auth)}:{int(time.time()) // 60}"
            try:
                redis = await get_redis()
                if redis is None:
                    raise RuntimeError("Redis unavailable")
                count = await redis.eval(COUNTER, 1, key, 65)
            except Exception:
                return await JSONResponse({"detail": "Rate limiter unavailable."}, 503)(
                    scope, receive, send
                )
            if count > limit:
                return await JSONResponse(
                    {"detail": "Too many requests."}, 429, headers={"Retry-After": "60"}
                )(scope, receive, send)
        received = 0
        started = False

        async def limited_receive():
            nonlocal received
            event = await receive()
            if event["type"] == "http.request":
                received += len(event.get("body", b""))
                if received > settings.request_max_bytes:
                    raise RequestTooLarge()
            return event

        async def track_send(message):
            nonlocal started
            if message["type"] == "http.response.start":
                started = True
            await send(message)

        try:
            await self.app(scope, limited_receive, track_send)
        except RequestTooLarge:
            if not started:
                await JSONResponse({"detail": "Request exceeds upload limit."}, 413)(
                    scope, receive, send
                )
