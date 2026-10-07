import json
import logging
from collections.abc import AsyncIterator
from dataclasses import dataclass, field
from uuid import UUID

import anyio
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.repositories.chat_repository import ChatRepository
from app.schemas.conversation import (
    ConversationDetail,
    ConversationOut,
    ConversationSend,
    MessageOut,
)
from app.services.retrieval.rag_service import (
    NOT_FOUND,
    normalize_citation_labels,
    prepare_evidence,
    resolve_citations,
)
from app.services.retrieval.web_search_service import (
    WEB_NOT_FOUND,
    WEB_SEARCH_TOOL,
    WebSearchService,
    web_evidence_messages,
)

logger = logging.getLogger(__name__)
GENERATION_TIMEOUT_SECONDS = 300


@dataclass
class PreparedTurn:
    user_id: UUID
    chat_id: UUID
    assistant_id: UUID
    messages: list[dict[str, str]]
    model: str
    sources: dict | None = None
    citations: list[dict] = field(default_factory=list)
    web_query: str | None = None
    web_search_agent: bool = False
    evidence_question: str = ""
    not_found: str = NOT_FOUND


class ConversationService:
    def __init__(self, sessions: async_sessionmaker[AsyncSession]):
        self.sessions = sessions

    async def list_chats(self, user_id: UUID) -> list[ConversationOut]:
        async with self.sessions() as db:
            chats = await ChatRepository(db).get_user_all_chats(user_id)
            return [ConversationOut.model_validate(chat) for chat in chats]

    async def create(self, user_id: UUID, title: str) -> ConversationOut:
        async with self.sessions() as db:
            chat = await ChatRepository(db).create(user_id, title)
            return ConversationOut.model_validate(chat)

    async def detail(self, user_id: UUID, chat_id: UUID) -> ConversationDetail:
        async with self.sessions() as db:
            repo = ChatRepository(db)
            chat = await repo.get_chat(user_id, chat_id)
            if chat is None:
                raise LookupError("Conversation not found.")
            await repo.recover_expired_turns(user_id, chat_id)
            await db.commit()
            entries = await repo.get_messages(user_id, chat_id)
            return ConversationDetail(
                **ConversationOut.model_validate(chat).model_dump(),
                messages=[MessageOut.model_validate(entry) for entry in entries],
            )

    async def prepare(
        self, user_id: UUID, chat_id: UUID, request: ConversationSend, provider: str, model: str
    ) -> PreparedTurn:
        # Ownership is checked before saving or calling the model.
        async with self.sessions() as db:
            repo = ChatRepository(db)
            if await repo.get_chat(user_id, chat_id, lock=True) is None:
                raise LookupError("Conversation not found.")
            # Read context under the same conversation lock as begin_turn, so
            # another request cannot commit a new turn between the read and save.
            entries = await repo.get_messages(user_id, chat_id)
            # Only complete pairs form model context; failed turns remain visible
            # in history without leaving consecutive unanswered user messages.
            completed = {
                e.request_id for e in entries if e.role == "assistant" and e.status == "complete"
            }
            messages = [
                {"role": e.role, "content": e.content}
                for e in entries
                if e.request_id in completed and e.status == "complete"
            ]
            # Bound the request while retaining the full conversation in storage.
            while messages and sum(len(m["content"]) for m in messages) > 100000:
                messages = messages[2:]
            messages.append({"role": "user", "content": request.message})
            web_query = None
            web_search_agent = False
            if request.web_search and request.web_search.enabled:
                WebSearchService().ensure_configured()
                if request.web_search.query:
                    web_query = request.web_search.query
                else:
                    web_search_agent = True
            sources = None
            if request.rag and request.rag.enabled:
                messages, sources = await prepare_evidence(
                    db, user_id, request.rag.document_ids, messages
                )
            assistant = await repo.begin_turn(
                user_id, chat_id, request.request_id, request.message, provider, model
            )
            has_web = bool(web_query or web_search_agent)
            return PreparedTurn(
                user_id,
                chat_id,
                assistant.id,
                messages,
                model,
                sources if sources is not None else ({} if has_web else None),
                web_query=web_query,
                web_search_agent=web_search_agent,
                evidence_question=request.message,
                not_found=WEB_NOT_FOUND if has_web else NOT_FOUND,
            )

    async def finish(self, turn: PreparedTurn, content: str, status: str) -> None:
        if turn.sources is not None:
            content = normalize_citation_labels(content)
        # Never keep the request's database connection open throughout generation.
        async with self.sessions() as db:
            await ChatRepository(db).finish_turn(
                turn.user_id, turn.chat_id, turn.assistant_id, content, status, turn.citations
            )

    async def stream(self, turn: PreparedTurn, llm, error_mapper) -> AsyncIterator[str]:
        parts: list[str] = []
        saved = False
        iterator = None
        try:
            with anyio.fail_after(GENERATION_TIMEOUT_SECONDS):
                # prepare() committed the turn and released its DB session first.
                if turn.web_search_agent and hasattr(llm, "chat"):
                    agent_messages = [
                        {
                            "role": "system",
                            "content": (
                                "You are a helpful assistant with access to a live web search tool. "
                                "If the user asks about current events, real-time facts, recent information, "
                                "or questions requiring external verification, use the web_search tool with a concise, targeted search query. "
                                "If the user's request does not require external or recent facts, answer directly without searching."
                            ),
                        },
                        *turn.messages,
                    ]
                    agent_res = await llm.chat(
                        messages=agent_messages,
                        model=turn.model,
                        tools=[WEB_SEARCH_TOOL],
                    )
                    tool_calls = agent_res.get("message", {}).get("tool_calls") or []
                    search_call = next(
                        (
                            tc
                            for tc in tool_calls
                            if tc.get("function", {}).get("name") == "web_search"
                        ),
                        None,
                    )
                    if search_call:
                        raw_args = search_call.get("function", {}).get("arguments", {})
                        if isinstance(raw_args, str):
                            try:
                                args = json.loads(raw_args)
                            except Exception:
                                args = {}
                        elif isinstance(raw_args, dict):
                            args = raw_args
                        else:
                            args = {}
                        query = str(args.get("query", "")).strip()[:400]
                        if not query:
                            query = turn.evidence_question.strip()[:400]
                        sources = dict(turn.sources or {})
                        sources.update(
                            await WebSearchService().search(
                                query,
                                start_label=len(sources) + 1,
                            )
                        )
                        turn.sources = sources
                        turn.messages = web_evidence_messages(turn.evidence_question, sources)
                    else:
                        direct_content = agent_res.get("message", {}).get("content", "")
                        if direct_content:
                            turn.sources = None
                            yield f"data: {json.dumps({'content': direct_content})}\n\n"
                            with anyio.CancelScope(shield=True):
                                await self.finish(turn, direct_content, "complete")
                                saved = True
                            yield 'data: {"done": true}\n\n'
                            return
                        else:
                            turn.sources = None
                elif turn.web_query or (turn.web_search_agent and not hasattr(llm, "chat")):
                    query_to_search = turn.web_query or turn.evidence_question.strip()[:400]
                    sources = dict(turn.sources or {})
                    sources.update(
                        await WebSearchService().search(
                            query_to_search,
                            start_label=len(sources) + 1,
                        )
                    )
                    turn.sources = sources
                    turn.messages = web_evidence_messages(turn.evidence_question, sources)

                async def no_evidence():
                    yield f"data: {json.dumps({'content': turn.not_found})}\n\n"
                    yield 'data: {"done": true}\n\n'

                iterator = (
                    no_evidence()
                    if turn.sources == {}
                    else llm.stream_chat(messages=turn.messages, model=turn.model)
                )
                async for frame in iterator:
                    # Provider adapters yield complete SSE frames, not raw network reads.
                    event = json.loads(frame.removeprefix("data: ").strip())
                    if event.get("error"):
                        raise RuntimeError("Provider generation failed.")
                    if event.get("content"):
                        parts.append(event["content"])
                        if turn.sources is None:
                            yield f"data: {json.dumps({'content': event['content']})}\n\n"
                    if event.get("done"):
                        if turn.sources is not None:
                            parts = [normalize_citation_labels("".join(parts))]
                            turn.citations = resolve_citations(
                                "".join(parts), turn.sources, not_found=turn.not_found
                            )
                        # Shield the short commit: cancellation cannot turn a committed
                        # answer back into an interrupted row.
                        with anyio.CancelScope(shield=True):
                            await self.finish(turn, "".join(parts), "complete")
                            saved = True
                        if turn.sources is not None:
                            yield f"data: {json.dumps({'content': ''.join(parts)})}\n\n"
                            yield f"data: {json.dumps({'citations': turn.citations})}\n\n"
                        yield 'data: {"done": true}\n\n'
                        return
                raise RuntimeError("Provider disconnected before completing the answer.")
        except Exception as exc:
            if turn.sources is not None:
                turn.citations = resolve_citations("".join(parts), turn.sources, strict=False)
            status, detail = error_mapper(exc)
            try:
                with anyio.CancelScope(shield=True):
                    await self.finish(turn, "".join(parts), "error")
                    saved = True
            except Exception:
                logger.warning("Could not persist failed conversation answer")
                status, detail = 503, "Could not save the answer. Reload the conversation."
            yield f"data: {json.dumps({'error': detail, 'status': status})}\n\n"
        finally:
            # ASGI disconnect cancellation must not cancel the database cleanup.
            with anyio.CancelScope(shield=True):
                try:
                    if iterator is not None:
                        await iterator.aclose()
                finally:
                    if not saved:
                        if turn.sources is not None:
                            turn.citations = resolve_citations(
                                "".join(parts), turn.sources, strict=False
                            )
                        try:
                            await self.finish(turn, "".join(parts), "interrupted")
                        except Exception:
                            logger.warning("Could not persist interrupted conversation answer")
