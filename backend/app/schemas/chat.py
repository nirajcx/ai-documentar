from typing import List, Optional
from pydantic import BaseModel


class ChatMessage(BaseModel):
    role: str  # "system", "user", "assistant"
    content: str


class ChatRequest(BaseModel):
    messages: List[ChatMessage]
    model: Optional[str] = "llama3.1:8b"
    stream: Optional[bool] = False


class ChatResponse(BaseModel):
    message: ChatMessage
    model: str
    done: bool
    total_duration: Optional[int] = None
