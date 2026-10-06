from datetime import datetime
from uuid import UUID, uuid4

from pgvector.sqlalchemy import Vector
from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    Uuid,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class Document(Base):
    __tablename__ = "documents"
    __table_args__ = (
        Index("ix_documents_status_lease", "status", "lease_until"),
        UniqueConstraint("user_id", "sha256", name="uq_documents_user_sha256"),
        CheckConstraint(
            "status IN ('queued','parsing','chunking','embedding','ready','needs_ocr','failed')",
            name="document_status",
        ),
        CheckConstraint(
            "index_version > 0 AND size_bytes > 0 AND chunk_count >= 0", name="document_counts"
        ),
        CheckConstraint(
            "progress IS NULL OR (progress >= 0 AND progress <= 100)", name="document_progress"
        ),
    )

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id"), index=True)
    filename: Mapped[str] = mapped_column(String(255))
    object_key: Mapped[str] = mapped_column(String(500))
    sha256: Mapped[str] = mapped_column(String(64))
    size_bytes: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(20), default="queued")
    page_count: Mapped[int | None] = mapped_column(Integer)
    chunk_count: Mapped[int] = mapped_column(Integer, default=0)
    progress: Mapped[int | None] = mapped_column(Integer)
    error: Mapped[str | None] = mapped_column(Text)
    index_version: Mapped[int] = mapped_column(Integer, default=1)
    embedding_model: Mapped[str] = mapped_column(String(100))
    embedding_digest: Mapped[str | None] = mapped_column(String(100))
    processing_version: Mapped[str] = mapped_column(String(100), default="page-char-v1")
    job_token: Mapped[UUID | None] = mapped_column(Uuid)
    lease_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class DocumentChunk(Base):
    __tablename__ = "document_chunks"
    __table_args__ = (
        UniqueConstraint(
            "document_id",
            "index_version",
            "position",
            name="uq_chunks_doc_version_position",
        ),
        CheckConstraint(
            "position > 0 AND page_start > 0 AND page_end >= page_start", name="chunk_pages"
        ),
    )

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    document_id: Mapped[UUID] = mapped_column(
        ForeignKey("documents.id", ondelete="CASCADE"), index=True
    )
    index_version: Mapped[int] = mapped_column(Integer)
    position: Mapped[int] = mapped_column(Integer)
    page_start: Mapped[int] = mapped_column(Integer)
    page_end: Mapped[int] = mapped_column(Integer)
    content: Mapped[str] = mapped_column(Text)
    embedding: Mapped[list[float]] = mapped_column(Vector(1024))
