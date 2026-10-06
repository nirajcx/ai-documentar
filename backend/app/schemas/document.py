from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class DocumentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    filename: str
    size_bytes: int
    status: Literal["queued", "parsing", "chunking", "embedding", "ready", "needs_ocr", "failed"]
    page_count: int | None
    chunk_count: int
    progress: int | None
    error: str | None
    created_at: datetime
