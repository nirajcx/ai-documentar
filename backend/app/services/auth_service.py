import asyncio
from datetime import datetime, timedelta

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import (
    SESSION_EXPIRE_HOURS,
    generate_session_token,
    hash_password,
    verify_password,
)
from app.repositories.session_repository import SessionRepository
from app.repositories.user_repository import UserRepository
from app.schemas.auth import LoginRequest, LoginResponse, LogoutResponse
from app.schemas.users import UserCreate, UserResponse


class AuthService:
    """
    Authentication business logic:
      - register: create a new user with Argon2id password hash
      - login: verify credentials, generate token, warm up Redis cache
      - logout: revoke session and evict cache
    """

    def __init__(self, session: AsyncSession):
        self.user_repo = UserRepository(session)
        self.session_repo = SessionRepository(session)

    async def register(self, user_create: UserCreate) -> UserResponse:
        # Step 1: Ensure email is not already registered
        if await self.user_repo.exists_by_email(user_create.email):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Email already registered",
            )

        # Step 2: Ensure username is unique
        if await self.user_repo.exists_by_username(user_create.username):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Username already taken",
            )

        # Step 3: Hash plain-text password using Argon2id
        hashed = await asyncio.to_thread(hash_password, user_create.password)

        # Step 4: Persist new user in database
        user = await self.user_repo.create(
            email=user_create.email,
            username=user_create.username,
            hashed_password=hashed,
        )

        return UserResponse.model_validate(user)

    async def login(self, login_req: LoginRequest) -> LoginResponse:
        # Step 1: Query user by email
        user = await self.user_repo.get_by_email(login_req.email)

        # Step 2: Constant-time password verification
        if not user or not await asyncio.to_thread(
            verify_password, login_req.password, user.hashed_password
        ):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid email or password",
            )

        # Step 3: Verify account status
        if not user.is_active:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Account is disabled",
            )

        # Step 4: Generate cryptographically secure session token
        token = generate_session_token()

        # Step 5: Compute session expiration timestamp
        expires_at = datetime.utcnow() + timedelta(hours=SESSION_EXPIRE_HOURS)

        # Step 6: Store session in PostgreSQL
        await self.session_repo.create_session(
            user_id=user.id,
            token=token,
            expires_at=expires_at,
        )

        return LoginResponse(
            session_token=token,
            user=UserResponse.model_validate(user),
            expires_at=expires_at,
        )

    async def logout(self, token: str) -> LogoutResponse:
        await self.session_repo.revoke_session(token)
        return LogoutResponse(message="Logged out successfully")
