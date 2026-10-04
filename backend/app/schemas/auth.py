from datetime import datetime

from pydantic import BaseModel, EmailStr

from app.schemas.users import UserResponse


class LoginRequest(BaseModel):
    """Payload for user email and password login."""
    email: EmailStr
    password: str


class LoginResponse(BaseModel):
    """Response returned upon successful authentication."""
    session_token: str
    user: UserResponse
    expires_at: datetime


class LogoutResponse(BaseModel):
    message: str
