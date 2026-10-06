"""Document index, durable queue state and pgvector extension."""

import sqlalchemy as sa
from alembic import op
from pgvector.sqlalchemy import Vector

revision = "0003_document_rag"
down_revision = "fd828c47c852"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")
    op.create_table(
        "documents",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("user_id", sa.Uuid(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("filename", sa.String(255), nullable=False),
        sa.Column("object_key", sa.String(500), nullable=False),
        sa.Column("sha256", sa.String(64), nullable=False),
        sa.Column("size_bytes", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("page_count", sa.Integer()),
        sa.Column("chunk_count", sa.Integer(), nullable=False),
        sa.Column("progress", sa.Integer()),
        sa.Column("error", sa.Text()),
        sa.Column("index_version", sa.Integer(), nullable=False),
        sa.Column("embedding_model", sa.String(100), nullable=False),
        sa.Column("embedding_digest", sa.String(100)),
        sa.Column("processing_version", sa.String(100), nullable=False),
        sa.Column("job_token", sa.Uuid()),
        sa.Column("lease_until", sa.DateTime(timezone=True)),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.UniqueConstraint("user_id", "sha256", name="uq_documents_user_sha256"),
        sa.CheckConstraint(
            "status IN ('queued','parsing','chunking','embedding','ready','needs_ocr','failed')",
            name="document_status",
        ),
        sa.CheckConstraint(
            "index_version > 0 AND size_bytes > 0 AND chunk_count >= 0", name="document_counts"
        ),
        sa.CheckConstraint(
            "progress IS NULL OR (progress >= 0 AND progress <= 100)", name="document_progress"
        ),
    )
    op.create_index("ix_documents_user_id", "documents", ["user_id"])
    op.create_index("ix_documents_status_lease", "documents", ["status", "lease_until"])
    op.create_table(
        "document_chunks",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "document_id",
            sa.Uuid(),
            sa.ForeignKey("documents.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("index_version", sa.Integer(), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("page_start", sa.Integer(), nullable=False),
        sa.Column("page_end", sa.Integer(), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("embedding", Vector(1024), nullable=False),
        sa.UniqueConstraint(
            "document_id", "index_version", "position", name="uq_chunks_doc_version_position"
        ),
        sa.CheckConstraint(
            "position > 0 AND page_start > 0 AND page_end >= page_start", name="chunk_pages"
        ),
    )
    op.create_index("ix_document_chunks_document_id", "document_chunks", ["document_id"])


def downgrade():
    op.drop_table("document_chunks")
    op.drop_table("documents")
    # The extension may be shared; don't drop it on downgrade.
