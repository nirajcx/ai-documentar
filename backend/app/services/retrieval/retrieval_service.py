from fastapi import HTTPException
from sqlalchemy import select

from app.db.models.document import Document, DocumentChunk
from app.services.ingestion.chunker import PROCESSING_VERSION


async def authorize_documents(db, user_id, ids, model, digest):
    if not 1 <= len(ids) <= 20:
        raise HTTPException(422, "Select 1–20 documents.")
    docs = list(
        await db.scalars(select(Document).where(Document.user_id == user_id, Document.id.in_(ids)))
    )
    if len(docs) != len(ids):
        raise HTTPException(404, "Document not found.")
    if any(d.status != "ready" for d in docs):
        raise HTTPException(409, "All selected documents must be ready.")
    if any(
        d.embedding_model != model
        or d.embedding_digest != digest
        or d.processing_version != PROCESSING_VERSION
        for d in docs
    ):
        raise HTTPException(409, "Document index is incompatible. Delete and re-upload the PDF.")


async def nearest_chunks(db, user_id, ids, vector, model, digest, max_distance):
    distance = DocumentChunk.embedding.cosine_distance(vector)
    rows = await db.execute(
        select(DocumentChunk, Document.filename, distance.label("distance"))
        .join(Document, Document.id == DocumentChunk.document_id)
        .where(
            Document.user_id == user_id,
            Document.id.in_(ids),
            Document.status == "ready",
            Document.embedding_model == model,
            Document.embedding_digest == digest,
            Document.processing_version == PROCESSING_VERSION,
            DocumentChunk.index_version == Document.index_version,
            distance <= max_distance,
        )
        .order_by(distance, DocumentChunk.id)
        .limit(6)
    )
    return rows.all()
