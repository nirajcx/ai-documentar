from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    String,
    Text,
    UniqueConstraint,
    Uuid,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class Chat(Base):
    """One conversation owned by one user; displayed as a sidebar item."""

    __tablename__ = "chats"

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True
    )
    title: Mapped[str] = mapped_column(String(120), nullable=False, default="New chat")
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False
    )


class ChatEntry(Base):
    """An ordered user or assistant message, including interrupted answers."""

    __tablename__ = "chat_messages"
    __table_args__ = (
        UniqueConstraint("chat_id", "position", name="uq_chat_messages_chat_position"),
        UniqueConstraint(
            "chat_id", "request_id", "role", name="uq_chat_messages_chat_request_role"
        ),
        CheckConstraint("role IN ('user', 'assistant')", name="chat_message_role"),
        CheckConstraint(
            "status IN ('streaming', 'complete', 'interrupted', 'error')",
            name="chat_message_status",
        ),
    )

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    chat_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("chats.id", ondelete="CASCADE"), index=True
    )
    request_id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), nullable=False)
    position: Mapped[int] = mapped_column(nullable=False)
    role: Mapped[str] = mapped_column(String(16), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False, default="")
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="complete")
    citations: Mapped[list[dict]] = mapped_column(JSONB, default=list, server_default="[]")
    provider: Mapped[str | None] = mapped_column(String(32))
    model: Mapped[str | None] = mapped_column(String(200))
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False
    )
