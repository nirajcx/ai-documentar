"""Keep source snapshots independent of document deletion/reindexing."""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision = "0004_citation_snapshots"
down_revision = "0003_document_rag"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "chat_messages", sa.Column("citations", JSONB(), nullable=False, server_default="[]")
    )


def downgrade():
    op.drop_column("chat_messages", "citations")
