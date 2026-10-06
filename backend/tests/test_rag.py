import asyncio
import json
from io import BytesIO
from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi import HTTPException
from pydantic import ValidationError
from pypdf import PdfWriter

from app.schemas.conversation import ConversationSend
from app.services.conversation_service import ConversationService, PreparedTurn
from app.services.ingestion.chunker import chunk_pages
from app.services.ingestion.pdf_parser import extract_pages, parse_safely
from app.services.retrieval.rag_service import NOT_FOUND, resolve_citations
from app.services.retrieval.retrieval_service import authorize_documents


def test_chunks_cover_pages_with_overlap():
    chunks = chunk_pages([(1, "abcdefghij"), (2, "klmnop")], size=6, overlap=2)
    assert [(c.position, c.page_start, c.content) for c in chunks] == [
        (1, 1, "abcdef"),
        (2, 1, "efghij"),
        (3, 2, "klmnop"),
    ]
    with pytest.raises(ValueError):
        chunk_pages([], size=6, overlap=6)


def test_pdf_validation_and_isolation():
    writer = PdfWriter()
    writer.add_blank_page(width=200, height=200)
    stream = BytesIO()
    writer.write(stream)
    assert parse_safely(stream.getvalue()) == [(1, "")]
    with pytest.raises(ValueError):
        extract_pages(b"not a PDF")
    with pytest.raises(ValueError):
        parse_safely(b"%PDF-fake")
    writer.encrypt("secret")
    stream = BytesIO()
    writer.write(stream)
    with pytest.raises(ValueError, match="Password"):
        extract_pages(stream.getvalue())


def test_rag_requires_explicit_bounded_document_scope():
    for ids in [[], [str(uuid4())] * 21, ["bad-uuid"]]:
        with pytest.raises(ValidationError):
            ConversationSend(
                message="Hi", request_id=uuid4(), rag={"enabled": True, "document_ids": ids}
            )


def test_citations_are_resolved_not_invented():
    sources = {"S1": {"label": "S1"}, "S2": {"label": "S2"}}
    assert resolve_citations("Answer [S2] [S2]", sources) == [sources["S2"]]
    assert resolve_citations(NOT_FOUND, sources) == []
    with pytest.raises(ValueError):
        resolve_citations("Answer [S99]", sources)
    with pytest.raises(ValueError):
        resolve_citations("Uncited claim", sources)
    assert resolve_citations("Partial [S1] [S99]", sources, strict=False) == [sources["S1"]]


@pytest.mark.parametrize(
    "status,digest,expected",
    [("ready", "digest", None), ("embedding", "digest", 409), ("ready", "old", 409)],
)
def test_document_readiness_and_digest(status, digest, expected):
    class DB:
        async def scalars(self, query):
            return [
                SimpleNamespace(
                    status=status,
                    embedding_model="model",
                    embedding_digest=digest,
                    processing_version="page-char-v1",
                )
            ]

    async def run():
        if expected:
            with pytest.raises(HTTPException) as e:
                await authorize_documents(DB(), uuid4(), [uuid4()], "model", "digest")
            assert e.value.status_code == expected
        else:
            await authorize_documents(DB(), uuid4(), [uuid4()], "model", "digest")

    asyncio.run(run())


@pytest.mark.parametrize(
    "answer,success",
    [("Supported [S1]", True), ("Fake [S99]", False), ("Uncited assertion", False)],
)
def test_rag_buffers_validation_and_persists_citations(answer, success):
    class LLM:
        async def stream_chat(self, **kwargs):
            yield "data: " + json.dumps({"content": answer}) + "\n\n"
            yield 'data: {"done": true}\n\n'

    async def run():
        service = ConversationService(None)
        saved = []

        async def finish(turn, content, status):
            saved.append((content, status, turn.citations))

        service.finish = finish
        turn = PreparedTurn(uuid4(), uuid4(), uuid4(), [], "model", {"S1": {"label": "S1"}})
        frames = [f async for f in service.stream(turn, LLM(), lambda e: (502, "Invalid answer"))]
        assert any('"done"' in f for f in frames) is success
        assert any('"content"' in f for f in frames) is success
        assert saved[-1][1] == ("complete" if success else "error")
        if success:
            assert saved[-1][2] == [{"label": "S1"}]
            assert "citations" in frames[-2]

    asyncio.run(run())


def test_no_evidence_does_not_call_llm():
    class LLM:
        def stream_chat(self, **kwargs):
            raise AssertionError("No evidence must not use general knowledge")

    async def run():
        service = ConversationService(None)

        async def finish(*args):
            pass

        service.finish = finish
        turn = PreparedTurn(uuid4(), uuid4(), uuid4(), [], "model", {})
        frames = [f async for f in service.stream(turn, LLM(), lambda e: (500, "bad"))]
        assert NOT_FOUND in "".join(frames)
        assert '"done": true' in frames[-1]

    asyncio.run(run())


@pytest.mark.parametrize("vectors", [[], [[0.0] * 1024], [[float("nan")] * 1024], [[1.0] * 3]])
def test_embedding_response_validation(monkeypatch, vectors):
    import httpx

    from app.services.llm import embedding_service

    class Client:
        def __init__(self, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            pass

        async def post(self, url, json):
            assert json["truncate"] is False
            return httpx.Response(
                200, json={"embeddings": vectors}, request=httpx.Request("POST", url)
            )

    monkeypatch.setattr(embedding_service.httpx, "AsyncClient", Client)
    with pytest.raises(ValueError):
        asyncio.run(embedding_service.EmbeddingService().embed(["text"]))


def test_legacy_chat_rejects_rag_instead_of_ignoring_it():
    from app.schemas.chat import ChatRequest

    with pytest.raises(ValidationError):
        ChatRequest(
            messages=[{"role": "user", "content": "hi"}],
            rag={"enabled": True, "document_ids": [str(uuid4())]},
        )


def test_typographic_citation_brackets_normalize_without_accepting_unknown_sources():
    from app.services.retrieval.rag_service import normalize_citation_labels

    assert normalize_citation_labels("20 days【S1】.") == "20 days[S1]."
    assert resolve_citations("20 days【S1】.", {"S1": {"label": "S1"}}) == [{"label": "S1"}]
    with pytest.raises(ValueError):
        resolve_citations("Fake【S99】.", {"S1": {"label": "S1"}})
