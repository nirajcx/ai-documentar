"""Real PostgreSQL/pgvector with deterministic storage and embedding adapters."""

import asyncio
import os
from io import BytesIO
from types import SimpleNamespace
from uuid import uuid4

import httpx
import pytest
from fastapi import HTTPException, UploadFile
from pypdf import PdfWriter
from pypdf.generic import DecodedStreamObject, DictionaryObject, NameObject
from sqlalchemy import func, select
from test_conversations import setup as conversation_setup

from app.api.routes import documents
from app.core.config import get_settings
from app.db.models.document import Document, DocumentChunk
from app.db.session import get_session
from app.schemas.conversation import ConversationSend
from app.services.document_service import DocumentService
from app.services.retrieval import rag_service
from app.services.retrieval.retrieval_service import authorize_documents, nearest_chunks
from app.workers.tasks.index_document import ingest

setup = conversation_setup

pytestmark = pytest.mark.skipif(
    not os.environ.get("TEST_DATABASE_URL"), reason="Needs test PostgreSQL"
)


def pdf_bytes(blank=False):
    writer = PdfWriter()
    page = writer.add_blank_page(width=600, height=800)
    if not blank:
        font = DictionaryObject(
            {
                NameObject("/Type"): NameObject("/Font"),
                NameObject("/Subtype"): NameObject("/Type1"),
                NameObject("/BaseFont"): NameObject("/Helvetica"),
            }
        )
        page[NameObject("/Resources")] = DictionaryObject(
            {NameObject("/Font"): DictionaryObject({NameObject("/F1"): writer._add_object(font)})}
        )
        content = DecodedStreamObject()
        content.set_data(
            b"BT /F1 12 Tf 50 700 Td (Employees receive 20 days of annual leave each year.) Tj ET"
        )
        page[NameObject("/Contents")] = writer._add_object(content)
    stream = BytesIO()
    writer.write(stream)
    return stream.getvalue()


class Storage:
    def __init__(self):
        self.objects = {}

    async def put(self, key, data):
        self.objects[key] = data

    async def get(self, key):
        return self.objects[key]

    async def delete(self, key):
        self.objects.pop(key, None)


class Embeddings:
    settings = SimpleNamespace(embedding_model="qwen3-embedding:0.6b", embedding_batch_size=8)

    async def digest(self):
        return "test-digest"

    async def embed(self, texts):
        return [[1.0] + [0.0] * 1023 for _ in texts]

    async def embed_query(self, query):
        return (await self.embed([query]))[0]


def test_upload_index_retrieve_cite_reload_delete(setup, monkeypatch):
    async def run():
        storage, embeddings = Storage(), Embeddings()
        async with setup.sessions() as db:
            service = DocumentService(db, storage)
            doc, created = await service.upload(
                setup.user, UploadFile(file=BytesIO(pdf_bytes()), filename="policy.pdf")
            )
            assert created and doc.status == "queued"
            doc_id = doc.id
        async with setup.sessions() as db:
            duplicate, created = await DocumentService(db, storage).upload(
                setup.user, UploadFile(file=BytesIO(pdf_bytes()), filename="renamed.pdf")
            )
            assert not created and duplicate.id == doc_id
        await ingest(doc_id, setup.sessions, storage, embeddings)
        await ingest(doc_id, setup.sessions, storage, embeddings)  # duplicate delivery is harmless
        async with setup.sessions() as db:
            doc = await db.get(Document, doc_id)
            assert (doc.status, doc.page_count, doc.chunk_count) == ("ready", 1, 1)
            assert await db.scalar(select(func.count(DocumentChunk.id))) == 1
            rows = await nearest_chunks(
                db,
                setup.user,
                [doc_id],
                await embeddings.embed_query("leave"),
                embeddings.settings.embedding_model,
                "test-digest",
                0.65,
            )
            assert len(rows) == 1 and rows[0][0].page_start == 1
            assert (
                await nearest_chunks(
                    db,
                    setup.other,
                    [doc_id],
                    await embeddings.embed_query("leave"),
                    embeddings.settings.embedding_model,
                    "test-digest",
                    0.65,
                )
                == []
            )
            with pytest.raises(HTTPException) as err:
                await authorize_documents(
                    db, setup.other, [doc_id], embeddings.settings.embedding_model, "test-digest"
                )
            assert err.value.status_code == 404
        monkeypatch.setattr(get_settings(), "rag_enabled", True)
        monkeypatch.setattr(rag_service, "EmbeddingService", Embeddings)
        chat = await setup.service.create(setup.user, "RAG")
        turn = await setup.service.prepare(
            setup.user,
            chat.id,
            ConversationSend(
                message="How much leave?",
                request_id=uuid4(),
                rag={"enabled": True, "document_ids": [doc_id]},
            ),
            "groq",
            "test",
        )

        class LLM:
            async def stream_chat(self, **kwargs):
                yield 'data: {"content":"20 days [S1]."}\n\n'
                yield 'data: {"done":true}\n\n'

        frames = [f async for f in setup.service.stream(turn, LLM(), lambda e: (500, "bad"))]
        assert "citations" in frames[-2] and "done" in frames[-1]
        detail = await setup.service.detail(setup.user, chat.id)
        assert detail.messages[-1].citations[0].page_start == 1
        async with setup.sessions() as db:
            await DocumentService(db, storage).delete(setup.user, doc_id)
        assert not storage.objects
        detail = await setup.service.detail(setup.user, chat.id)
        assert detail.messages[-1].citations[0].excerpt.startswith("Employees receive")
        await ingest(doc_id, setup.sessions, storage, embeddings)
        async with setup.sessions() as db:
            assert await db.get(Document, doc_id) is None
            assert await db.scalar(select(func.count(DocumentChunk.id))) == 0

    asyncio.run(run())


@pytest.mark.parametrize("mode", ["scanned", "offline", "delete_during_embedding"])
def test_worker_failures_and_deletion(setup, mode):
    async def run():
        storage, embeddings = Storage(), Embeddings()
        async with setup.sessions() as db:
            doc, _ = await DocumentService(db, storage).upload(
                setup.user,
                UploadFile(file=BytesIO(pdf_bytes(mode == "scanned")), filename="test.pdf"),
            )
            doc_id = doc.id

        async def embed(texts):
            if mode == "offline":
                raise RuntimeError("private upstream detail")
            async with setup.sessions() as db:
                await DocumentService(db, storage).delete(setup.user, doc_id)
            return [[1.0] + [0.0] * 1023 for _ in texts]

        embeddings.embed = embed
        await ingest(doc_id, setup.sessions, storage, embeddings)
        async with setup.sessions() as db:
            doc = await db.get(Document, doc_id)
            if mode == "delete_during_embedding":
                assert doc is None
            else:
                assert doc.status == ("needs_ocr" if mode == "scanned" else "failed")
                assert "private upstream" not in doc.error
            assert await db.scalar(select(func.count(DocumentChunk.id))) == 0
            if mode == "offline":
                doc = await DocumentService(db, storage).retry(setup.user, doc_id)
                assert doc.status == "queued" and doc.index_version == 2
        if mode == "offline":
            await ingest(doc_id, setup.sessions, storage, Embeddings())
            async with setup.sessions() as db:
                assert (await db.get(Document, doc_id)).status == "ready"

    asyncio.run(run())


def test_document_api_ownership_and_pdf_contract(setup, monkeypatch):
    from app.services import document_service

    storage = Storage()
    monkeypatch.setattr(document_service, "S3Service", lambda: storage)
    setup.app.include_router(documents.router, prefix="/api/v1")

    async def session():
        async with setup.sessions() as db:
            yield db

    setup.app.dependency_overrides[get_session] = session

    async def run():
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=setup.app), base_url="http://test"
        ) as c:
            url = "/api/v1/documents"
            response = await c.post(
                url, files={"file": ("test.pdf", pdf_bytes(), "application/pdf")}
            )
            assert response.status_code == 202
            doc = response.json()
            assert set(doc) == {
                "id",
                "filename",
                "size_bytes",
                "status",
                "page_count",
                "chunk_count",
                "progress",
                "error",
                "created_at",
            }
            response = await c.get(f"{url}/{doc['id']}/file")
            assert response.headers["content-type"] == "application/pdf"
            assert response.content.startswith(b"%PDF-")
            assert (
                await c.post(url, files={"file": ("fake.pdf", b"bad", "application/pdf")})
            ).status_code == 422
            from app.api.dependencies import get_current_user

            setup.app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(
                id=setup.other
            )
            assert (await c.get(f"{url}/{doc['id']}/file")).status_code == 404
            assert (await c.delete(f"{url}/{doc['id']}")).status_code == 404
            assert (await c.get(url)).json() == []

    asyncio.run(run())


@pytest.mark.skipif(
    os.environ.get("LIVE_RAG_TEST") != "1", reason="Opt-in live storage/model smoke"
)
def test_live_rag_roundtrip(setup, monkeypatch):
    from app.api.routes.chat import get_chat_service
    from app.api.routes.conversations import stream_error
    from app.services.llm.embedding_service import EmbeddingService
    from app.services.storage.s3_service import S3Service

    async def run():
        storage, embeddings = S3Service(), EmbeddingService()
        key = None
        try:
            async with setup.sessions() as db:
                doc, _ = await DocumentService(db, storage).upload(
                    setup.user,
                    UploadFile(file=BytesIO(pdf_bytes()), filename="rag-smoke-policy.pdf"),
                )
                doc_id, key = doc.id, doc.object_key
            await ingest(doc_id, setup.sessions, storage, embeddings)
            async with setup.sessions() as db:
                doc = await db.get(Document, doc_id)
                assert doc.status == "ready", doc.error
            monkeypatch.setattr(get_settings(), "rag_enabled", True)
            chat = await setup.service.create(setup.user, "Synthetic RAG smoke")
            llm, model = get_chat_service(None)
            turn = await setup.service.prepare(
                setup.user,
                chat.id,
                ConversationSend(
                    message="How many annual leave days do employees receive?",
                    request_id=uuid4(),
                    rag={"enabled": True, "document_ids": [doc_id]},
                ),
                get_settings().chat_provider,
                model,
            )
            assert turn.sources, "Expected relevant evidence from real embeddings"
            frames = [f async for f in setup.service.stream(turn, llm, stream_error)]
            detail = await setup.service.detail(setup.user, chat.id)
            answer = detail.messages[-1]
            assert '"done": true' in frames[-1], (frames[-1], answer.content)
            assert "20" in answer.content and answer.citations[0].page_start == 1
            assert answer.citations[0].document_id == doc_id
            assert (await storage.get(key)).startswith(b"%PDF-")
        finally:
            if key:
                await storage.delete(key)

    asyncio.run(run())


def test_concurrent_uploads_dedupe_and_quota(setup, monkeypatch):
    async def run():
        storage = Storage()

        async def upload():
            async with setup.sessions() as db:
                doc, created = await DocumentService(db, storage).upload(
                    setup.user, UploadFile(file=BytesIO(pdf_bytes()), filename="same.pdf")
                )
                return doc.id, created

        results = await asyncio.gather(upload(), upload())
        assert results[0][0] == results[1][0]
        assert sum(created for _, created in results) == 1
        assert len(storage.objects) == 1
        monkeypatch.setattr(get_settings(), "document_max_count", 1)
        async with setup.sessions() as db:
            with pytest.raises(HTTPException) as e:
                await DocumentService(db, storage).upload(
                    setup.user,
                    UploadFile(file=BytesIO(pdf_bytes(blank=True)), filename="different.pdf"),
                )
            assert e.value.status_code == 409

    asyncio.run(run())


def test_expired_lease_reclaims_and_active_job_is_not_duplicated(setup):
    from datetime import timedelta

    async def run():
        storage = Storage()
        async with setup.sessions() as db:
            doc, _ = await DocumentService(db, storage).upload(
                setup.user, UploadFile(file=BytesIO(pdf_bytes()), filename="lease.pdf")
            )
            doc_id = doc.id
            old_token = uuid4()
            doc.status, doc.job_token = "embedding", old_token
            doc.lease_until = await db.scalar(select(func.now())) + timedelta(minutes=20)
            await db.commit()
        await ingest(doc_id, setup.sessions, storage, Embeddings())
        async with setup.sessions() as db:
            doc = await db.get(Document, doc_id)
            assert doc.status == "embedding" and doc.job_token == old_token
            doc.lease_until = await db.scalar(select(func.now())) - timedelta(minutes=1)
            await db.commit()
        await ingest(doc_id, setup.sessions, storage, Embeddings())
        async with setup.sessions() as db:
            doc = await db.get(Document, doc_id)
            assert doc.status == "ready" and doc.job_token != old_token
            assert await db.scalar(select(func.count(DocumentChunk.id))) == 1

    asyncio.run(run())
