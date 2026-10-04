from datetime import datetime
from typing import Optional
from uuid import UUID

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.redis import get_redis
from app.db.models.session import AuthSession


class SessionRepository:
    """Data access layer for AuthSession model."""

    def __init__(self, session: AsyncSession):
        self.session = session

    async def create_session(
        self, user_id: UUID, token: str, expires_at: datetime
    ) -> AuthSession:
        auth_session = AuthSession(
            user_id=user_id,
            session_token=token,
            expires_at=expires_at,
        )
        self.session.add(auth_session)
        await self.session.commit()
        await self.session.refresh(auth_session)
        return auth_session

    async def get_by_token(self, token: str) -> Optional[AuthSession]:
        result = await self.session.execute(
            select(AuthSession).where(AuthSession.session_token == token)
        )
        return result.scalar_one_or_none()

    async def revoke_session(self, token: str) -> None:
        """Mark session as revoked and invalidate Redis cache."""
        session = await self.get_by_token(token)
        if session:
            session.is_revoked = True
            await self.session.commit()

        try:
            redis = await get_redis()
            if redis:
                await redis.delete(f"session:{token}")
        except Exception:
            pass

    async def revoke_all_for_user(self, user_id: UUID) -> None:
        """Revoke all active sessions for a user across all devices."""
        from sqlalchemy import update

        result = await self.session.execute(
            select(AuthSession.session_token).where(
                AuthSession.user_id == user_id,
                AuthSession.is_revoked.is_(False),
            )
        )
        tokens = result.scalars().all()

        await self.session.execute(
            update(AuthSession)
            .where(AuthSession.user_id == user_id, AuthSession.is_revoked.is_(False))
            .values(is_revoked=True)
        )
        await self.session.commit()

        if tokens:
            try:
                redis = await get_redis()
                if redis:
                    keys = [f"session:{t}" for t in tokens]
                    await redis.delete(*keys)
            except Exception:
                pass

    async def delete_expired(self) -> None:
        """Purge expired sessions."""
        now = datetime.utcnow()
        await self.session.execute(
            delete(AuthSession).where(AuthSession.expires_at < now)
        )
        await self.session.commit()
