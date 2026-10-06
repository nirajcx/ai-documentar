from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class ConversationCreate(BaseModel):
    title: str = Field(default="New chat", min_length=1, max_length=120)


class ConversationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    title: str
    created_at: datetime
    updated_at: datetime


class RagOptions(BaseModel):
    model_config = ConfigDict(extra="forbid")
    enabled: bool = False
    document_ids: list[UUID] = Field(default_factory=list, max_length=20)

    @model_validator(mode="after")
    def selected_documents(self):
        if self.enabled and not self.document_ids:
            raise ValueError("Select at least one document.")
        if len(set(self.document_ids)) != len(self.document_ids):
            raise ValueError("Duplicate document IDs are not allowed.")
        return self


class CitationOut(BaseModel):
    label: str
    document_id: UUID
    chunk_id: UUID
    filename: str
    page_start: int
    page_end: int
    excerpt: str


class MessageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    request_id: UUID
    position: int
    role: Literal["user", "assistant"]
    content: str
    status: Literal["streaming", "complete", "interrupted", "error"]
    citations: list[CitationOut] = Field(default_factory=list)
    provider: str | None = None
    model: str | None = None
    created_at: datetime


class ConversationDetail(ConversationOut):
    messages: list[MessageOut]


class ConversationSend(BaseModel):
    model_config = ConfigDict(extra="forbid")
    rag: RagOptions | None = None
    message: str = Field(min_length=1, max_length=100000)
    request_id: UUID
    provider: Literal["groq", "ollama"] | None = None
    model: str | None = Field(default=None, min_length=1, max_length=200)

    @field_validator("message", "model")
    @classmethod
    def reject_blank(cls, value: str | None) -> str | None:
        if value is not None and not value.strip():
            raise ValueError("Value cannot be blank.")
        return value
