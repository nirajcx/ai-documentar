import json
import logging
from typing import Literal

import httpx
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from openai import APIConnectionError, APIStatusError, APITimeoutError, RateLimitError

from app.api.dependencies import CurrentUser
from app.core.config import get_settings
from app.schemas.chat import ChatMessage, ChatRequest, ChatResponse
from app.services.llm.groq_service import GroqGenerationError, GroqService
from app.services.llm.ollama_service import OllamaService

router = APIRouter(prefix="/chat", tags=["chat"])
logger = logging.getLogger(__name__)


def get_chat_service(provider: str | None):
    settings = get_settings()
    selected = provider or settings.chat_provider
    if selected == "groq":
        try:
            return GroqService(settings), settings.groq_model
        except ValueError as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from exc
    if selected == "ollama":
        return OllamaService(), settings.ollama_chat_model
    raise HTTPException(422, "Unknown chat provider.")


def provider_error(exc: Exception) -> HTTPException:
    # Never expose upstream exception bodies, prompts, or credentials.
    logger.warning("Chat provider request failed (%s)", type(exc).__name__)
    if isinstance(exc, RateLimitError):
        return HTTPException(429, "Chat provider rate limit reached. Please try again shortly.")
    if isinstance(exc, (APITimeoutError, httpx.TimeoutException)):
        return HTTPException(504, "Chat provider timed out. Please try again.")
    if isinstance(exc, (APIConnectionError, httpx.ConnectError)):
        return HTTPException(503, "Could not connect to the selected chat provider.")
    if isinstance(exc, APIStatusError) and exc.status_code in {401, 403}:
        return HTTPException(
            503,
            "Chat provider authentication failed. Check its API key in the backend environment.",
        )
    if isinstance(exc, GroqGenerationError):
        return HTTPException(502, str(exc))
    return HTTPException(502, "Chat generation failed. Check the provider configuration and model.")


@router.get("/models")
async def list_models(current_user: CurrentUser, provider: Literal["groq", "ollama"] | None = None):
    settings = get_settings()
    selected = provider or settings.chat_provider
    if selected == "groq":
        # A configured chat model, not the provider's full catalog of non-chat models.
        return {
            "provider": selected,
            "default_model": settings.groq_model,
            "configured": bool(settings.groq_api_key.get_secret_value().strip()),
            "models": [{"name": settings.groq_model}],
        }
    try:
        return {
            "provider": selected,
            "default_model": settings.ollama_chat_model,
            "configured": True,
            "models": await OllamaService().get_models(),
        }
    except Exception as exc:
        raise provider_error(exc) from exc


@router.post("/", response_model=ChatResponse)
async def chat_message(req: ChatRequest, current_user: CurrentUser):
    service, default_model = get_chat_service(req.provider)
    try:
        result = await service.chat(
            messages=[m.model_dump() for m in req.messages],
            model=req.model or default_model
        )
        return ChatResponse(
            message=ChatMessage(
                role="assistant", content=result.get("message", {}).get("content", "")
            ),
            model=result.get("model", req.model or default_model),
            done=result.get("done", True),
            total_duration=result.get("total_duration"),
        )
    except Exception as exc:
        raise provider_error(exc) from exc


@router.post("/stream")
async def stream_chat_message(req: ChatRequest, current_user: CurrentUser):
    service, default_model = get_chat_service(req.provider)

    async def events():
        iterator = service.stream_chat(
            messages=[m.model_dump() for m in req.messages],
            model=req.model or default_model
        )
        try:
            async for event in iterator:
                yield event
        except Exception as exc:
            # Headers have already been sent: report provider failures in an SSE frame.
            error = provider_error(exc)
            yield f"data: {json.dumps({'error': error.detail, 'status': error.status_code})}\n\n"
        finally:
            await iterator.aclose()

    return StreamingResponse(
        events(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
