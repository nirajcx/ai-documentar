from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse

from app.api.dependencies import CurrentUser
from app.api.routes.chat import get_chat_service, provider_error
from app.core.config import get_settings
from app.db.session import SessionLocal
from app.repositories.chat_repository import ChatBusyError, DuplicateTurnError
from app.schemas.conversation import (
    ConversationCreate,
    ConversationDetail,
    ConversationOut,
    ConversationSend,
)
from app.services.conversation_service import ConversationService
from app.services.retrieval.rag_service import CitationValidationError

router = APIRouter(prefix="/conversations", tags=["conversations"])


def get_conversation_service() -> ConversationService:
    return ConversationService(SessionLocal)


Service = Annotated[ConversationService, Depends(get_conversation_service)]


def stream_error(exc: Exception) -> tuple[int, str]:
    if isinstance(exc, HTTPException):
        return exc.status_code, exc.detail
    if isinstance(exc, CitationValidationError):
        return 502, "The answer failed source validation. Please try again."
    if isinstance(exc, TimeoutError):
        return 504, "Generation timed out. Try a shorter question."
    error = provider_error(exc)
    return error.status_code, error.detail


@router.get("/capabilities")
async def conversation_capabilities():
    settings = get_settings()
    return {
        "web_search_ready": bool(
            settings.web_search_enabled and settings.tavily_api_key.get_secret_value().strip()
        ),
        "web_search_provider": "tavily",
    }


@router.get("", response_model=list[ConversationOut])
async def list_conversations(user: CurrentUser, service: Service):
    return await service.list_chats(user.id)


@router.post("", response_model=ConversationOut, status_code=201)
async def create_conversation(req: ConversationCreate, user: CurrentUser, service: Service):
    return await service.create(user.id, req.title)


@router.get("/{chat_id}", response_model=ConversationDetail)
async def get_conversation(chat_id: UUID, user: CurrentUser, service: Service):
    try:
        return await service.detail(user.id, chat_id)
    except LookupError as exc:
        raise HTTPException(404, "Conversation not found.") from exc


@router.post("/{chat_id}/messages/stream")
async def stream_message(chat_id: UUID, req: ConversationSend, user: CurrentUser, service: Service):
    llm, default_model = get_chat_service(req.provider)
    try:
        turn = await service.prepare(
            user.id,
            chat_id,
            req,
            req.provider or get_settings().chat_provider,
            req.model or default_model,
        )
    except LookupError as exc:
        raise HTTPException(404, "Conversation not found.") from exc
    except (ChatBusyError, DuplicateTurnError) as exc:
        raise HTTPException(409, str(exc)) from exc
    return StreamingResponse(
        service.stream(turn, llm, stream_error),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
