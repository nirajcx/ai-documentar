import json
from typing import AsyncGenerator, List, Dict, Any
import httpx
from app.core.config import get_settings


class OllamaService:
    """
    Client for interacting with local Ollama on MacBook Docker (192.168.1.4:11434).
    Supports:
      - list available models
      - chat generation (non-stream and streaming SSE)
      - embeddings (for upcoming RAG pipeline)
    """

    def __init__(self):
        self.settings = get_settings()
        self.base_url = self.settings.ollama_base_url.rstrip("/")

    async def get_models(self) -> List[Dict[str, Any]]:
        """Fetch list of available models from Ollama."""
        async with httpx.AsyncClient(timeout=10.0) as client:
            res = await client.get(f"{self.base_url}/api/tags")
            res.raise_for_status()
            data = res.json()
            return data.get("models", [])

    async def chat(self, messages: List[Dict[str, str]], model: str = "llama3.1:8b") -> Dict[str, Any]:
        """Send chat messages and return the response."""
        payload = {
            "model": model,
            "messages": messages,
            "stream": False,
        }
        async with httpx.AsyncClient(timeout=60.0) as client:
            res = await client.post(f"{self.base_url}/api/chat", json=payload)
            res.raise_for_status()
            return res.json()

    async def stream_chat(
        self, messages: List[Dict[str, str]], model: str = "llama3.1:8b"
    ) -> AsyncGenerator[str, None]:
        """Stream chat tokens token-by-token from Ollama as Server-Sent Events."""
        payload = {
            "model": model,
            "messages": messages,
            "stream": True,
        }
        async with httpx.AsyncClient(timeout=120.0) as client:
            async with client.stream("POST", f"{self.base_url}/api/chat", json=payload) as response:
                response.raise_for_status()
                async for line in response.aiter_lines():
                    if not line:
                        continue
                    try:
                        chunk = json.loads(line)
                        content = chunk.get("message", {}).get("content", "")
                        if content:
                            yield f"data: {json.dumps({'content': content})}\n\n"
                        if chunk.get("done", False):
                            yield f"data: {json.dumps({'done': True})}\n\n"
                    except json.JSONDecodeError:
                        continue
