from typing import List, Dict, Any
from fastapi import APIRouter, HTTPException, status
from fastapi.responses import StreamingResponse

from app.api.dependencies import CurrentUser
from app.schemas.chat import ChatRequest, ChatResponse, ChatMessage
from app.services.llm.ollama_service import OllamaService

router = APIRouter(prefix="/chat", tags=["chat"])
ollama = OllamaService()


@router.get("/models")
async def list_models(current_user: CurrentUser):
    """List available LLM models on the local Ollama instance."""
    try:
        models = await ollama.get_models()
        return {"models": models}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Could not connect to Ollama: {str(e)}",
        )


@router.post("/", response_model=ChatResponse)
async def chat_message(req: ChatRequest, current_user: CurrentUser):
    """
    Send messages to Ollama and get complete response.
    Supports multi-turn conversation.
    """
    try:
        messages_dict = [{"role": m.role, "content": m.content} for m in req.messages]
        result = await ollama.chat(messages=messages_dict, model=req.model)
        
        reply_content = result.get("message", {}).get("content", "")
        return ChatResponse(
            message=ChatMessage(role="assistant", content=reply_content),
            model=result.get("model", req.model),
            done=result.get("done", True),
            total_duration=result.get("total_duration"),
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Ollama generation failed: {str(e)}",
        )


@router.post("/stream")
async def stream_chat_message(req: ChatRequest, current_user: CurrentUser):
    """
    Stream chat tokens in real-time using Server-Sent Events (SSE).
    """
    try:
        messages_dict = [{"role": m.role, "content": m.content} for m in req.messages]
        return StreamingResponse(
            ollama.stream_chat(messages=messages_dict, model=req.model),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",
            },
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Streaming failed: {str(e)}",
        )
