from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr


class UserCreate(BaseModel):
    """Payload for user registration."""
    email: EmailStr
    username: str
    password: str


class UserUpdate(BaseModel):
    display_name: str | None = None


class UserResponse(BaseModel):
    """Public user profile returned to clients."""
    id: UUID
    email: str
    username: str
    is_active: bool
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
