"""Durable DB queue + leased Celery execution. Run one beat scheduler alongside workers."""

import asyncio
import logging
import time
from datetime import timedelta
from uuid import UUID, uuid4

from redis.asyncio import Redis
from sqlalchemy import delete, func, or_, select, update
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.core.config import get_settings
from app.db.models.document import Document, DocumentChunk
from app.services.ingestion.chunker import chunk_pages
from app.services.ingestion.pdf_parser import parse_safely
from app.services.llm.embedding_service import EmbeddingService
from app.services.storage.s3_service import S3Service
from app.workers.celery_app import celery_app

logger = logging.getLogger(__name__)
ACTIVE = ("parsing", "chunking", "embedding")


def session_factory():
    # Celery invokes asyncio.run per task; don't reuse connections across event loops.
    return create_async_engine(get_settings().database_url.get_secret_value(), poolclass=NullPool)


async def dispatch_pending():
    engine = session_factory()
    try:
        async with async_sessionmaker(engine)() as db:
            ids = list(
                await db.scalars(
                    select(Document.id)
                    .where(
                        or_(
                            Document.status == "queued",
                            (Document.status.in_(ACTIVE)) & (Document.lease_until < func.now()),
                        )
                    )
                    .order_by(Document.created_at)
                    .limit(100)
                )
            )
        for document_id in ids:
            await asyncio.to_thread(
                index_document.apply_async, args=[str(document_id)], expires=60, retry=False
            )
        # A recent heartbeat proves beat delivered a dispatch task to a worker.
        async with Redis.from_url(get_settings().redis_url.get_secret_value()) as redis:
            await redis.set("documentar:dispatcher:heartbeat", str(time.time()), ex=180)
    finally:
        await engine.dispose()


@celery_app.task(name="documents.dispatch")
def dispatch_documents():
    asyncio.run(dispatch_pending())


async def ingest(document_id, sessions, storage, embeddings):
    token = uuid4()
    async with sessions() as db:
        doc = await db.scalar(select(Document).where(Document.id == document_id).with_for_update())
        if doc is None:
            return
        now = await db.scalar(select(func.now()))
        if doc.status != "queued" and not (
            doc.status in ACTIVE and doc.lease_until and doc.lease_until < now
        ):
            return
        doc.job_token, doc.lease_until = token, now + timedelta(minutes=20)
        doc.status, doc.progress, doc.error = "parsing", None, None
        version, key, model = doc.index_version, doc.object_key, doc.embedding_model
        await db.commit()

    async def state(**values):
        async with sessions() as db:
            result = await db.execute(
                update(Document)
                .where(
                    Document.id == document_id,
                    Document.job_token == token,
                    Document.index_version == version,
                )
                .values(**values)
            )
            await db.commit()
            return result.rowcount == 1

    try:
        pages = await asyncio.to_thread(parse_safely, await storage.get(key))
        if any(len(text.strip()) < 30 for _, text in pages):
            await state(
                status="needs_ocr",
                page_count=len(pages),
                progress=None,
                error="One or more pages have too little text. OCR/review is required.",
                lease_until=None,
            )
            return
        if not await state(status="chunking", page_count=len(pages)):
            return
        chunks = chunk_pages(pages)
        if model != embeddings.settings.embedding_model:
            raise ValueError("Embedding configuration changed; re-upload with the new index.")
        digest = await embeddings.digest()
        if not await state(status="embedding", progress=0):
            return
        vectors = []
        batch_size = embeddings.settings.embedding_batch_size
        for start in range(0, len(chunks), batch_size):
            vectors.extend(
                await embeddings.embed([c.content for c in chunks[start : start + batch_size]])
            )
            if not await state(progress=int(100 * len(vectors) / len(chunks))):
                return
            async with Redis.from_url(get_settings().redis_url.get_secret_value()) as redis:
                await redis.set("documentar:dispatcher:heartbeat", str(time.time()), ex=180)
        if await embeddings.digest() != digest:
            raise ValueError("Embedding model changed during ingestion.")
        async with sessions() as db:
            doc = await db.scalar(
                select(Document).where(Document.id == document_id).with_for_update()
            )
            if doc is None or doc.job_token != token or doc.index_version != version:
                return
            await db.execute(delete(DocumentChunk).where(DocumentChunk.document_id == document_id))
            db.add_all(
                [
                    DocumentChunk(
                        document_id=document_id,
                        index_version=version,
                        position=c.position,
                        page_start=c.page_start,
                        page_end=c.page_end,
                        content=c.content,
                        embedding=v,
                    )
                    for c, v in zip(chunks, vectors, strict=True)
                ]
            )
            doc.status, doc.progress, doc.chunk_count = "ready", 100, len(chunks)
            doc.embedding_digest, doc.lease_until = digest, None
            await db.commit()
    except Exception:
        logger.exception("Document indexing failed: %s", document_id)
        await state(
            status="failed",
            progress=None,
            lease_until=None,
            error="Indexing failed. Check storage/embedding services and retry.",
        )


@celery_app.task(name="documents.index", soft_time_limit=840, time_limit=900)
def index_document(document_id: str):
    async def run():
        engine = session_factory()
        try:
            await ingest(
                UUID(document_id),
                async_sessionmaker(engine, expire_on_commit=False),
                S3Service(),
                EmbeddingService(),
            )
        finally:
            await engine.dispose()

    asyncio.run(run())
