"""Web-search contracts and grounded streaming, with no paid network requests."""

import asyncio
import json
from datetime import UTC, datetime
from uuid import uuid4

import httpx
import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from app.api.routes.conversations import stream_error
from app.core.config import Settings
from app.schemas.conversation import ConversationSend, MessageOut
from app.services.conversation_service import ConversationService, PreparedTurn
from app.services.retrieval.web_search_service import (
    WEB_NOT_FOUND,
    WebSearchService,
    public_source_url,
)


def settings(**overrides):
    return Settings(_env_file=None, web_search_enabled=True, tavily_api_key="test-key", **overrides)


def result(**overrides):
    return {
        "title": "Official docs",
        "url": "https://example.com/docs",
        "content": "Evidence",
        **overrides,
    }


def search(handler, **kwargs):
    return asyncio.run(
        WebSearchService(settings(), httpx.MockTransport(handler)).search("test", **kwargs)
    )


def test_search_contract_normalization_and_no_provider_answer():
    def handler(request):
        assert str(request.url) == "https://api.tavily.com/search"
        assert request.headers["Authorization"] == "Bearer test-key"
        payload = json.loads(request.content)
        assert payload == {
            "query": "test",
            "search_depth": "basic",
            "max_results": 5,
            "topic": "general",
            "include_answer": False,
            "include_raw_content": False,
            "include_images": False,
            "auto_parameters": False,
        }
        return httpx.Response(
            200,
            json={
                "answer": "Untrusted pre-generated answer",
                "results": [
                    result(content="x" * 3000),
                    result(url="https://example.com/docs#part"),
                    result(url="javascript:alert(1)"),
                    result(url="http://127.0.0.1/private"),
                    result(url="https://example.org", content=""),
                    None,
                ],
            },
        )

    sources = search(handler, start_label=3)
    assert list(sources) == ["S3"]
    assert sources["S3"]["kind"] == "web"
    assert len(sources["S3"]["excerpt"]) == 2000
    assert "Untrusted pre-generated" not in str(sources)
    assert sources["S3"]["retrieved_at"]


@pytest.mark.parametrize(
    "url",
    [
        "javascript:alert(1)",
        "file:///etc/passwd",
        "http://localhost/",
        "http://10.0.0.1/",
        "https://user:pass@example.com",
        "https://example.com:9999",
        "https://foo.internal/",
        "https://example.com/\n",
        "https://example.com\\@evil.test/",
        "https://[::1]/",
    ],
)
def test_reject_unsafe_source_urls(url):
    assert public_source_url(url) is None


@pytest.mark.parametrize(
    "status,expected",
    [(401, 503), (403, 503), (429, 429), (432, 429), (433, 429), (500, 502), (302, 502)],
)
def test_upstream_errors_are_safe_and_not_retried(status, expected):
    calls = []

    def handler(request):
        calls.append(request)
        return httpx.Response(status, text="PRIVATE KEY AND PROVIDER DETAILS")

    with pytest.raises(HTTPException) as exc:
        search(handler)
    assert exc.value.status_code == expected
    assert "PRIVATE" not in exc.value.detail
    assert len(calls) == 1


@pytest.mark.parametrize(
    "response",
    [
        httpx.Response(200, text="invalid"),
        httpx.Response(200, json={}),
        httpx.Response(200, content=b"x" * 1_000_001),
    ],
)
def test_bad_response(response):
    with pytest.raises(HTTPException) as exc:
        search(lambda request: response)
    assert exc.value.status_code == 502


def test_timeout():
    def handler(request):
        raise httpx.ReadTimeout("secret upstream", request=request)

    with pytest.raises(HTTPException) as exc:
        search(handler)
    assert exc.value.status_code == 504


@pytest.mark.parametrize("enabled,key", [(False, "test"), (True, "")])
def test_unconfigured_does_not_call_network(enabled, key):
    def handler(request):
        pytest.fail("must not call search")

    service = WebSearchService(
        Settings(_env_file=None, web_search_enabled=enabled, tavily_api_key=key),
        httpx.MockTransport(handler),
    )
    with pytest.raises(HTTPException) as exc:
        asyncio.run(service.search("test"))
    assert exc.value.status_code == 503


def test_request_validation():
    for options in (
        {"enabled": True, "query": " "},
        {"enabled": True, "query": "a" * 401},
        {"enabled": True, "api_key": "bad"},
    ):
        with pytest.raises(ValidationError):
            ConversationSend(message="Hi", request_id=uuid4(), web_search=options)
    with pytest.raises(ValidationError):
        ConversationSend(message="a" * 401, request_id=uuid4(), web_search={"enabled": True})
    req = ConversationSend(
        message="a" * 401,
        request_id=uuid4(),
        web_search={"enabled": True, "query": "short public query"},
    )
    assert req.web_search.query == "short public query"


@pytest.mark.parametrize("mode", ["web", "mixed", "empty", "invalid", "failure"])
def test_web_stream_validates_merges_and_persists(monkeypatch, mode):
    calls, saved = [], []
    document = {
        "label": "S1",
        "document_id": str(uuid4()),
        "chunk_id": str(uuid4()),
        "filename": "private.pdf",
        "page_start": 1,
        "page_end": 1,
        "excerpt": "PRIVATE DOCUMENT",
    }

    async def mocked_search(self, query, start_label=1):
        assert query == "public query"  # Never private PDF contents or old chat history.
        calls.append(query)
        if mode == "failure":
            raise HTTPException(429, "Web search quota reached.")
        if mode == "empty":
            return {}
        label = f"S{start_label}"
        return {
            label: {
                "kind": "web",
                "label": label,
                "title": "Site",
                "url": "https://example.com",
                "excerpt": "Public evidence",
                "retrieved_at": datetime.now(UTC).isoformat(),
            }
        }

    monkeypatch.setattr(WebSearchService, "search", mocked_search)

    class LLM:
        async def stream_chat(self, messages, model):
            assert mode not in {"empty", "failure"}
            assert "untrusted" in messages[0]["content"]
            assert "Public evidence" in messages[1]["content"]
            text = (
                "Claim [S1] [S2]"
                if mode == "mixed"
                else "Claim [S99]"
                if mode == "invalid"
                else "Claim [S1]"
            )
            yield "data: " + json.dumps({"content": text}) + "\n\n"
            yield 'data: {"done": true}\n\n'

    async def run():
        service = ConversationService(None)

        async def finish(turn, content, status):
            saved.append((content, status, turn.citations))

        service.finish = finish
        turn = PreparedTurn(
            uuid4(),
            uuid4(),
            uuid4(),
            [],
            "model",
            {"S1": document} if mode == "mixed" else {},
            web_query="public query",
            evidence_question="Question",
            not_found=WEB_NOT_FOUND,
        )
        frames = [
            json.loads(frame.removeprefix("data: "))
            async for frame in service.stream(turn, LLM(), stream_error)
        ]
        assert calls == ["public query"]
        if mode in {"failure", "invalid"}:
            assert saved[-1][1] == "error"
            assert any("error" in frame for frame in frames)
            assert not any("content" in frame or "done" in frame for frame in frames)
        else:
            assert saved[-1][1] == "complete"
            assert frames[-1] == {"done": True}
            assert frames[-2]["citations"] == saved[-1][2]
            if mode == "empty":
                assert saved[-1][0] == WEB_NOT_FOUND
            else:
                # Same schema used when reloading saved history, including legacy PDFs.
                message = MessageOut(
                    id=uuid4(),
                    request_id=uuid4(),
                    position=2,
                    role="assistant",
                    content=saved[-1][0],
                    status="complete",
                    citations=saved[-1][2],
                    created_at=datetime.now(UTC),
                )
                assert message.citations[-1].kind == "web"
                if mode == "mixed":
                    assert message.citations[0].kind == "document"

    asyncio.run(run())


def test_web_off_does_not_search(monkeypatch):
    async def bad(*args, **kwargs):
        pytest.fail("Web search is opt-in")

    monkeypatch.setattr(WebSearchService, "search", bad)

    async def run():
        service = ConversationService(None)
        service.finish = lambda *args: asyncio.sleep(0)

        class LLM:
            async def stream_chat(self, **kwargs):
                yield 'data: {"content":"General answer"}\n\n'
                yield 'data: {"done":true}\n\n'

        turn = PreparedTurn(uuid4(), uuid4(), uuid4(), [], "model")
        frames = [f async for f in service.stream(turn, LLM(), stream_error)]
        assert "General answer" in "".join(frames)

    asyncio.run(run())
