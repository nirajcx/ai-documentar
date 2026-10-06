from uuid import UUID

from sqlalchemy import select

from app.db.models.document import Document


class DocumentRepository:
    def __init__(self, db):
        self.db = db

    async def get(self, user_id: UUID, document_id: UUID, *, lock=False):
        query = select(Document).where(Document.id == document_id, Document.user_id == user_id)
        doc = await self.db.scalar(query.with_for_update() if lock else query)
        if doc is None:
            raise LookupError("Document not found.")
        return doc

    async def list(self, user_id):
        return list(
            await self.db.scalars(
                select(Document)
                .where(Document.user_id == user_id)
                .order_by(Document.created_at.desc(), Document.id)
            )
        )
