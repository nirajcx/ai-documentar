from datetime import datetime
from typing import Annotated

from fastapi import Cookie, Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.db.models.user import User
from app.db.session import DB
from app.repositories.session_repository import SessionRepository
from app.repositories.user_repository import UserRepository

SESSION_COOKIE_NAME = "session_token"
bearer_scheme = HTTPBearer(auto_error=False)


def get_session_token(
    auth_header: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
    session_token: str | None = Cookie(default=None, alias=SESSION_COOKIE_NAME),
) -> str:
    token = auth_header.credentials if auth_header else session_token
    if not token:
        raise HTTPException(401, "Not authenticated", headers={"WWW-Authenticate": "Bearer"})
    return token


CurrentToken = Annotated[str, Depends(get_session_token)]


async def get_current_user(token: CurrentToken, db: DB) -> User:
    # PostgreSQL is authoritative on every request. Cached profiles must never
    # bypass session expiry/revocation or an administrator disabling an account.
    session = await SessionRepository(db).get_by_token(token)
    if session is None or session.is_revoked or datetime.utcnow() >= session.expires_at:
        raise HTTPException(401, "Session expired or revoked.")
    user = await UserRepository(db).get_by_id(session.user_id)
    if user is None or not user.is_active:
        raise HTTPException(401, "Account unavailable.")
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]
