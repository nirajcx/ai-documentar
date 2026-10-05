import asyncio
import json
from unittest.mock import AsyncMock

import httpx
import pytest
from fastapi import FastAPI
from openai import AsyncOpenAI

from app.api.dependencies import get_current_user
from app.api.routes import chat
from app.core.config import Settings
from app.services.llm import groq_service


@pytest.fixture
def app(monkeypatch):
    settings = Settings(_env_file=None, groq_api_key="test-key", chat_provider="groq")
    monkeypatch.setattr(chat, "get_settings", lambda: settings)
    app = FastAPI()
    app.include_router(chat.router, prefix="/api/v1")
    app.dependency_overrides[get_current_user] = lambda: object()
    return app


def request(app, path, body=None):
    async def run():
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test"
        ) as client:
            if body is None:
                return await client.get(path)
            return await client.post(path, json=body)

    return asyncio.run(run())


MESSAGES = [{"role": "user", "content": "Hello"}]


def mock_groq(monkeypatch, handler):
    def client(**kwargs):
        assert kwargs["base_url"] == "https://api.groq.com/openai/v1"
        assert kwargs["api_key"] == "test-key"
        return AsyncOpenAI(
            **kwargs, http_client=httpx.AsyncClient(transport=httpx.MockTransport(handler))
        )

    monkeypatch.setattr(groq_service, "AsyncOpenAI", client)


def test_groq_complete_response_and_sdk_payload(app, monkeypatch):
    def handler(req):
        assert str(req.url) == "https://api.groq.com/openai/v1/chat/completions"
        assert req.headers["authorization"] == "Bearer test-key"
        body = json.loads(req.content)
        assert body["messages"] == MESSAGES
        assert body["model"] == "openai/gpt-oss-120b"
        assert body["reasoning_effort"] == "low"
        assert body["include_reasoning"] is False
        assert body["max_completion_tokens"] == 2048
        return httpx.Response(
            200,
            json={
                "id": "test",
                "object": "chat.completion",
                "created": 0,
                "model": body["model"],
                "choices": [
                    {
                        "index": 0,
                        "message": {"role": "assistant", "content": "Hello!"},
                        "finish_reason": "stop",
                    }
                ],
            },
        )

    mock_groq(monkeypatch, handler)
    response = request(app, "/api/v1/chat/", {"messages": MESSAGES})
    assert response.status_code == 200
    assert response.json()["message"] == {"role": "assistant", "content": "Hello!"}
    assert response.json()["done"] is True


def chunk(content=None, finish=None):
    return (
        "data: "
        + json.dumps(
            {
                "id": "test",
                "object": "chat.completion.chunk",
                "created": 0,
                "model": "openai/gpt-oss-120b",
                "choices": [
                    {
                        "index": 0,
                        "delta": {"content": content, "reasoning": "private"},
                        "finish_reason": finish,
                    }
                ],
            }
        )
        + "\n\n"
    )


@pytest.mark.parametrize("finish", ["stop", "length", None])
def test_groq_sse_completion_and_incomplete_answers(app, monkeypatch, finish):
    data = chunk('Hello "world"\n') + (chunk(finish=finish) if finish else "") + "data: [DONE]\n\n"
    mock_groq(monkeypatch, lambda req: httpx.Response(200, text=data))
    response = request(app, "/api/v1/chat/stream", {"messages": MESSAGES})
    events = [
        json.loads(frame.removeprefix("data: ")) for frame in response.text.strip().split("\n\n")
    ]
    assert events[0] == {"content": 'Hello "world"\n'}
    assert "private" not in response.text
    if finish == "stop":
        assert events[-1] == {"done": True}
    else:
        assert "error" in events[-1]
        assert not any(event.get("done") for event in events)


@pytest.mark.parametrize("status", [401, 429, 500])
@pytest.mark.parametrize("endpoint", ["/", "/stream"])
def test_upstream_errors_are_sanitized(app, monkeypatch, status, endpoint):
    mock_groq(
        monkeypatch,
        lambda req: httpx.Response(
            status, json={"error": {"message": "secret-upstream-details", "type": "upstream_error"}}
        ),
    )
    response = request(app, f"/api/v1/chat{endpoint}", {"messages": MESSAGES})
    expected = {401: 503, 429: 429, 500: 502}[status]
    if endpoint == "/":
        assert response.status_code == expected
    else:
        event = json.loads(response.text.removeprefix("data: "))
        assert event["status"] == expected
        assert "error" in event and "done" not in event
    assert "secret-upstream-details" not in response.text
    assert "test-key" not in response.text


@pytest.mark.parametrize("endpoint", ["/", "/stream"])
def test_missing_key_fails_before_streaming(app, monkeypatch, endpoint):
    monkeypatch.setattr(chat, "get_settings", lambda: Settings(_env_file=None, groq_api_key=""))
    response = request(app, f"/api/v1/chat{endpoint}", {"messages": MESSAGES})
    assert response.status_code == 503
    assert "GROQ_API_KEY" in response.json()["detail"]


def test_models_and_ollama_provider_remain_available(app, monkeypatch):
    models = request(app, "/api/v1/chat/models").json()
    assert models["provider"] == "groq"
    assert models["models"] == [{"name": "openai/gpt-oss-120b"}]
    assert "test-key" not in json.dumps(models)
    ollama = AsyncMock()
    ollama.get_models.return_value = [{"name": "local-model"}]
    ollama.chat.return_value = {"message": {"content": "Local answer"}, "done": True}
    monkeypatch.setattr(chat, "OllamaService", lambda: ollama)
    assert (
        request(app, "/api/v1/chat/models?provider=ollama").json()["models"][0]["name"]
        == "local-model"
    )
    response = request(app, "/api/v1/chat/", {"provider": "ollama", "messages": MESSAGES})
    assert response.json()["message"]["content"] == "Local answer"
    ollama.chat.assert_awaited_once_with(messages=MESSAGES, model="llama3.1:8b")


def test_chat_still_requires_authentication(app):
    app.dependency_overrides.clear()
    assert request(app, "/api/v1/chat/models").status_code == 401


def test_cancelling_groq_iterator_closes_connection(monkeypatch):
    class Body(httpx.AsyncByteStream):
        closed = False

        async def __aiter__(self):
            yield chunk("First token").encode()
            yield chunk("Second token").encode()

        async def aclose(self):
            self.closed = True

    body = Body()
    mock_groq(monkeypatch, lambda req: httpx.Response(200, stream=body))

    async def run():
        service = groq_service.GroqService(Settings(_env_file=None, groq_api_key="test-key"))
        iterator = service.stream_chat(MESSAGES, "openai/gpt-oss-120b")
        assert "First token" in await anext(iterator)
        await iterator.aclose()
        assert body.closed

    asyncio.run(run())


def test_ollama_stream_and_environment_default(app, monkeypatch):
    monkeypatch.setattr(
        chat,
        "get_settings",
        lambda: Settings(_env_file=None, chat_provider="ollama", ollama_chat_model="local-default"),
    )

    class Local:
        async def stream_chat(self, messages, model):
            assert messages == MESSAGES
            assert model == "local-default"
            yield 'data: {"content":"Local token"}\n\n'
            yield 'data: {"done":true}\n\n'

    monkeypatch.setattr(chat, "OllamaService", Local)
    response = request(app, "/api/v1/chat/stream", {"messages": MESSAGES})
    assert '"content":"Local token"' in response.text
    assert '"done":true' in response.text


@pytest.mark.parametrize("endpoint", ["/", "/stream"])
def test_timeout_is_reported(app, monkeypatch, endpoint):
    def timeout(req):
        raise httpx.ReadTimeout("upstream private details", request=req)

    mock_groq(monkeypatch, timeout)
    response = request(app, f"/api/v1/chat{endpoint}", {"messages": MESSAGES})
    if endpoint == "/":
        assert response.status_code == 504
    else:
        assert json.loads(response.text.removeprefix("data: "))["status"] == 504
    assert "private details" not in response.text
