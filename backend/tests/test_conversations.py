"""PostgreSQL integration tests; use an isolated TEST_DATABASE_URL, never DATABASE_URL."""

import asyncio
import os
from types import SimpleNamespace
from uuid import uuid4

import httpx
import pytest
from fastapi import FastAPI
from sqlalchemy import text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.api.dependencies import get_current_user
from app.api.routes import conversations
from app.db.base import Base
from app.db.models.user import User
from app.repositories.chat_repository import ChatBusyError
from app.schemas.conversation import ConversationSend
from app.services import conversation_service
from app.services.conversation_service import ConversationService

URL = os.environ.get("TEST_DATABASE_URL")
pytestmark = pytest.mark.skipif(
    not URL, reason="Set TEST_DATABASE_URL for PostgreSQL integration tests"
)


@pytest.fixture
def setup(monkeypatch):
    schema = "test_conversations_" + uuid4().hex
    admin = create_async_engine(URL, poolclass=NullPool)
    engine = create_async_engine(
        URL,
        poolclass=NullPool,
        connect_args={"server_settings": {"search_path": schema + ",public"}},
    )
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    user_id, other_id = uuid4(), uuid4()

    async def initialize():
        async with admin.begin() as conn:
            await conn.execute(text(f'CREATE SCHEMA "{schema}"'))
        async with engine.begin() as conn:
            await conn.run_sync(lambda sync: Base.metadata.create_all(sync, checkfirst=False))
        async with sessions() as db:
            db.add_all(
                [
                    User(
                        id=user_id, email="one@test.local", username="one", hashed_password="test"
                    ),
                    User(
                        id=other_id, email="two@test.local", username="two", hashed_password="test"
                    ),
                ]
            )
            await db.commit()

    asyncio.run(initialize())
    service = ConversationService(sessions)
    app = FastAPI()
    app.include_router(conversations.router, prefix="/api/v1")
    app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(id=user_id)
    app.dependency_overrides[conversations.get_conversation_service] = lambda: service
    contexts = []

    class LLM:
        async def stream_chat(self, messages, model):
            contexts.append(messages)
            yield 'data: {"content": "Hello "}\n\n'
            yield 'data: {"content": "world"}\n\n'
            yield 'data: {"done": true}\n\n'

    monkeypatch.setattr(conversations, "get_chat_service", lambda provider: (LLM(), "test-model"))
    yield SimpleNamespace(
        app=app, service=service, sessions=sessions, user=user_id, other=other_id, contexts=contexts
    )

    async def cleanup():
        await engine.dispose()
        async with admin.begin() as conn:
            await conn.execute(text(f'DROP SCHEMA "{schema}" CASCADE'))
        await admin.dispose()

    asyncio.run(cleanup())


def request(env, method, path, body=None):
    async def run():
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=env.app), base_url="http://test"
        ) as client:
            return await client.request(method, "/api/v1/conversations" + path, json=body)

    return asyncio.run(run())


def create(env):
    response = request(env, "POST", "", {"title": "New chat"})
    assert response.status_code == 201
    return response.json()["id"]


def send(env, chat_id, message="Hi", request_id=None):
    return request(
        env,
        "POST",
        f"/{chat_id}/messages/stream",
        {
            "message": message,
            "request_id": str(request_id or uuid4()),
            "provider": "groq",
        },
    )


def test_complete_conversation_and_context(setup):
    cid = create(setup)
    response = send(setup, cid, "First question")
    assert response.status_code == 200
    assert '"done": true' in response.text
    detail = request(setup, "GET", f"/{cid}").json()
    assert detail["title"] == "First question"
    assert [m["content"] for m in detail["messages"]] == ["First question", "Hello world"]
    assert [m["status"] for m in detail["messages"]] == ["complete", "complete"]
    assert send(setup, cid, "Follow-up").status_code == 200
    assert setup.contexts[-1] == [
        {"role": "user", "content": "First question"},
        {"role": "assistant", "content": "Hello world"},
        {"role": "user", "content": "Follow-up"},
    ]
    detail = request(setup, "GET", f"/{cid}").json()
    assert [m["position"] for m in detail["messages"]] == [1, 2, 3, 4]
    assert request(setup, "GET", "").json()[0]["id"] == cid


def test_ownership_and_authentication(setup):
    cid = create(setup)
    setup.app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(id=setup.other)
    assert request(setup, "GET", "").json() == []
    assert request(setup, "GET", f"/{cid}").status_code == 404
    assert send(setup, cid).status_code == 404
    assert not setup.contexts
    setup.app.dependency_overrides.pop(get_current_user)
    assert request(setup, "GET", "").status_code == 401
    assert request(setup, "POST", "", {"title": "test"}).status_code == 401
    assert request(setup, "GET", f"/{cid}").status_code == 401
    assert send(setup, cid).status_code == 401


def test_duplicate_turn_and_validation(setup):
    cid = create(setup)
    rid = uuid4()
    assert send(setup, cid, request_id=rid).status_code == 200
    assert send(setup, cid, request_id=rid).status_code == 409
    assert len(setup.contexts) == 1
    assert send(setup, cid, "   ").status_code == 422
    assert request(setup, "GET", "/not-a-uuid").status_code == 422
    assert len(request(setup, "GET", f"/{cid}").json()["messages"]) == 2


@pytest.mark.parametrize("mode", ["error", "truncated"])
def test_failed_stream_saves_partial_answer(setup, monkeypatch, mode):
    cid = create(setup)

    class Broken:
        async def stream_chat(self, messages, model):
            yield 'data: {"content": "Partial answer"}\n\n'
            if mode == "error":
                raise RuntimeError("private upstream credentials")

    monkeypatch.setattr(conversations, "get_chat_service", lambda provider: (Broken(), "test"))
    response = send(setup, cid)
    assert '"error"' in response.text and '"done"' not in response.text
    assert "private upstream" not in response.text
    entries = request(setup, "GET", f"/{cid}").json()["messages"]
    assert entries[-1]["content"] == "Partial answer"
    assert entries[-1]["status"] == "error"


def test_cancelled_generation_persists_and_closes_provider(setup):
    async def run():
        chat = await setup.service.create(setup.user, "Test")
        req = ConversationSend(message="Hi", request_id=uuid4())
        turn = await setup.service.prepare(setup.user, chat.id, req, "groq", "test")
        closed = False

        class Slow:
            async def stream_chat(self, messages, model):
                nonlocal closed
                try:
                    yield 'data: {"content": "Partial"}\n\n'
                    await asyncio.sleep(60)
                finally:
                    closed = True

        received = asyncio.Event()

        async def consume():
            async for _ in setup.service.stream(turn, Slow(), conversations.stream_error):
                received.set()

        task = asyncio.create_task(consume())
        await received.wait()
        task.cancel()
        with pytest.raises(asyncio.CancelledError):
            await task
        detail = await setup.service.detail(setup.user, chat.id)
        assert detail.messages[-1].status == "interrupted"
        assert detail.messages[-1].content == "Partial"
        assert closed

    asyncio.run(run())


def test_database_failure_never_reports_done(setup, monkeypatch):
    cid = create(setup)

    async def fail(*args):
        raise RuntimeError("private database details")

    monkeypatch.setattr(setup.service, "finish", fail)
    response = send(setup, cid)
    assert '"done"' not in response.text
    assert '"status": 503' in response.text
    assert "private database" not in response.text


def test_timeout_releases_turn(setup, monkeypatch):
    cid = create(setup)

    class Slow:
        async def stream_chat(self, messages, model):
            await asyncio.sleep(60)
            yield 'data: {"done": true}\n\n'

    monkeypatch.setattr(conversations, "get_chat_service", lambda provider: (Slow(), "test"))
    monkeypatch.setattr(conversation_service, "GENERATION_TIMEOUT_SECONDS", 0.01)
    response = send(setup, cid)
    assert '"status": 504' in response.text
    assert request(setup, "GET", f"/{cid}").json()["messages"][-1]["status"] == "error"


def test_concurrent_turns_and_expired_recovery(setup):
    async def run():
        chat = await setup.service.create(setup.user, "Test")

        async def prepare():
            return await setup.service.prepare(
                setup.user,
                chat.id,
                ConversationSend(message="Hi", request_id=uuid4()),
                "groq",
                "test",
            )

        results = await asyncio.gather(prepare(), prepare(), return_exceptions=True)
        assert sum(isinstance(result, ChatBusyError) for result in results) == 1
        detail = await setup.service.detail(setup.user, chat.id)
        assert len(detail.messages) == 2
        async with setup.sessions() as db:
            await db.execute(
                text(
                    "UPDATE chat_messages SET created_at = now() - interval '11 minutes' "
                    "WHERE status = 'streaming'"
                )
            )
            await db.commit()
        detail = await setup.service.detail(setup.user, chat.id)
        assert detail.messages[-1].status == "interrupted"
        turn = await prepare()
        assert turn.messages == [{"role": "user", "content": "Hi"}]
        await setup.service.finish(turn, "Recovered", "complete")

    asyncio.run(run())


def test_web_search_persists_history_and_duplicate_never_searches_again(setup, monkeypatch):
    from app.services.retrieval.web_search_service import WebSearchService

    calls = []

    def configured(self):
        pass

    async def search(self, query, start_label=1):
        calls.append(query)
        # Real sessions have already been released before the external search.
        return {
            "S1": {
                "kind": "web",
                "label": "S1",
                "title": "Public source",
                "url": "https://example.com",
                "excerpt": "Public fact",
                "retrieved_at": "2026-10-07T00:00:00Z",
            }
        }

    class GroundedLLM:
        async def stream_chat(self, messages, model):
            assert "Public fact" in messages[1]["content"]
            yield 'data: {"content":"Public fact [S1]"}\n\n'
            yield 'data: {"done":true}\n\n'

    monkeypatch.setattr(WebSearchService, "ensure_configured", configured)
    monkeypatch.setattr(WebSearchService, "search", search)
    monkeypatch.setattr(conversations, "get_chat_service", lambda provider: (GroundedLLM(), "test"))
    cid = create(setup)
    body = {
        "message": "My question",
        "request_id": str(uuid4()),
        "web_search": {"enabled": True, "query": "public query"},
    }
    response = request(setup, "POST", f"/{cid}/messages/stream", body)
    assert response.status_code == 200 and '"done"' in response.text
    detail = request(setup, "GET", f"/{cid}").json()
    source = detail["messages"][-1]["citations"][0]
    assert source["kind"] == "web" and source["url"] == "https://example.com"
    assert detail["messages"][-1]["status"] == "complete"
    assert request(setup, "POST", f"/{cid}/messages/stream", body).status_code == 409
    setup.app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(id=setup.other)
    assert (
        request(
            setup, "POST", f"/{cid}/messages/stream", {**body, "request_id": str(uuid4())}
        ).status_code
        == 404
    )
    assert calls == ["public query"]
