from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class ChatMessage(BaseModel):
    role: Literal["system", "user", "assistant"]
    content: str


class ChatRequest(BaseModel):
    # Legacy general-chat endpoints must reject unsupported RAG options.
    model_config = ConfigDict(extra="forbid")
    messages: list[ChatMessage] = Field(min_length=1)
    model: str | None = Field(default=None, min_length=1)
    provider: Literal["groq", "ollama"] | None = None
    stream: bool = False


class ChatResponse(BaseModel):
    message: ChatMessage
    model: str
    done: bool
    total_duration: int | None = None
