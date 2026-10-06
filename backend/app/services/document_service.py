import asyncio
import hashlib
from uuid import uuid4

from fastapi import HTTPException
from sqlalchemy import func, select

from app.core.config import get_settings
from app.db.models.document import Document
from app.db.models.user import User
from app.repositories.document_repository import DocumentRepository
from app.services.ingestion.pdf_parser import MAX_BYTES, parse_safely
from app.services.storage.s3_service import S3Service


class DocumentService:
    def __init__(self, db, storage=None):
        self.db = db
        self.storage = storage or S3Service()
        self.repo = DocumentRepository(db)

    async def upload(self, user_id, file):
        data = bytearray()
        while block := await file.read(1024 * 1024):
            data.extend(block)
            if len(data) > MAX_BYTES:
                raise HTTPException(413, "PDF exceeds 25 MB.")
        if not data.startswith(b"%PDF-"):
            raise HTTPException(422, "Upload a valid PDF.")
        digest = hashlib.sha256(data).hexdigest()
        # Serialize account quota/dedupe decisions, including concurrent uploads.
        await self.db.scalar(select(User.id).where(User.id == user_id).with_for_update())
        existing = await self.db.scalar(
            select(Document).where(Document.user_id == user_id, Document.sha256 == digest)
        )
        if existing:
            return existing, False
        settings = get_settings()
        count, size = (
            await self.db.execute(
                select(
                    func.count(Document.id), func.coalesce(func.sum(Document.size_bytes), 0)
                ).where(Document.user_id == user_id)
            )
        ).one()
        if count >= settings.document_max_count or size + len(data) > settings.document_quota_bytes:
            raise HTTPException(409, "Document quota reached. Delete a document before uploading.")
        try:
            await asyncio.to_thread(parse_safely, bytes(data))
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from exc
        doc_id = uuid4()
        key = f"users/{user_id}/documents/{doc_id}.pdf"
        doc = Document(
            id=doc_id,
            user_id=user_id,
            filename=(file.filename or "document.pdf").replace("\\", "/").split("/")[-1][:255],
            object_key=key,
            sha256=digest,
            size_bytes=len(data),
            embedding_model=settings.embedding_model,
            status="queued",
            progress=0,
        )
        await self.storage.put(key, bytes(data))
        try:
            self.db.add(doc)
            # The queued row IS the durable work item; beat dispatches after commit.
            await self.db.commit()
        except Exception:
            await self.db.rollback()
            await self.storage.delete(key)
            raise
        await self.db.refresh(doc)
        return doc, True

    async def retry(self, user_id, document_id):
        doc = await self.repo.get(user_id, document_id, lock=True)
        if doc.status != "failed":
            raise HTTPException(409, "Only failed documents can be retried.")
        doc.index_version += 1
        doc.status, doc.error, doc.progress = "queued", None, 0
        doc.job_token, doc.lease_until = None, None
        await self.db.commit()
        return doc

    async def delete(self, user_id, document_id):
        doc = await self.repo.get(user_id, document_id, lock=True)
        # Hold row lock through storage removal: a worker cannot publish during deletion.
        await self.storage.delete(doc.object_key)
        await self.db.delete(doc)
        await self.db.commit()
