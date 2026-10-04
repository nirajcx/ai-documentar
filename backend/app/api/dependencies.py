import json
from datetime import datetime
from typing import Annotated
from uuid import UUID

from fastapi import Cookie, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.redis import get_redis
from app.db.models.user import User
from app.db.session import DB
from app.repositories.session_repository import SessionRepository
from app.repositories.user_repository import UserRepository

SESSION_COOKIE_NAME = "session_token"
SESSION_CACHE_TTL = 300  # 5 minutes

bearer_scheme = HTTPBearer(auto_error=False)


async def get_current_user(
    auth_header: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    session_token: str | None = Cookie(default=None, alias=SESSION_COOKIE_NAME),
    db: DB = None,
) -> User:
    """
    Authenticate user via direct Session Token (Bearer header or HttpOnly Cookie).
    No Keycloak required.
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Not authenticated — please log in with your credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    token = None
    if auth_header and auth_header.credentials:
        token = auth_header.credentials
    elif session_token:
        token = session_token

    if not token:
        raise credentials_exception

    redis = None
    try:
        redis = await get_redis()
    except Exception:
        pass

    cache_key = f"session:{token}"
    if redis:
        try:
            cached = await redis.get(cache_key)
            if cached:
                data = json.loads(cached)
                return User(
                    id=UUID(data["id"]),
                    email=data["email"],
                    username=data["username"],
                    hashed_password="",
                    is_active=data["is_active"],
                    created_at=datetime.fromisoformat(data.get("created_at", datetime.utcnow().isoformat())),
                )
        except Exception:
            pass

    session_repo = SessionRepository(db)
    auth_session = await session_repo.get_by_token(token)
    if auth_session is None or auth_session.is_revoked:
        raise credentials_exception

    if datetime.utcnow() > auth_session.expires_at:
        raise credentials_exception

    user_repo = UserRepository(db)
    user = await user_repo.get_by_id(auth_session.user_id)
    if user is None or not user.is_active:
        raise credentials_exception

    if redis:
        try:
            await redis.setex(
                cache_key,
                SESSION_CACHE_TTL,
                json.dumps({
                    "id": str(user.id),
                    "email": user.email,
                    "username": user.username,
                    "is_active": user.is_active,
                    "created_at": user.created_at.isoformat() if user.created_at else datetime.utcnow().isoformat(),
                }),
            )
        except Exception:
            pass

    return user


CurrentUser = Annotated[User, Depends(get_current_user)]
