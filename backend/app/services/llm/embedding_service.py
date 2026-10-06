import math

import httpx

from app.core.config import get_settings


class EmbeddingService:
    def __init__(self):
        self.settings = get_settings()

    async def digest(self) -> str:
        async with httpx.AsyncClient(timeout=15) as client:
            response = await client.get(f"{self.settings.ollama_base_url.rstrip('/')}/api/tags")
            response.raise_for_status()
        for model in response.json()["models"]:
            if model["name"] == self.settings.embedding_model:
                return model["digest"]
        raise ValueError("Configured embedding model is not installed.")

    async def embed(self, text: list[str]) -> list[list[float]]:
        if not text:
            return []

        async with httpx.AsyncClient(timeout=120) as client:
            response = await client.post(
                f"{self.settings.ollama_base_url.rstrip('/')}/api/embed",
                json={
                    "model": self.settings.embedding_model,
                    "input": text,
                    "dimensions": self.settings.embedding_dimensions,
                    "truncate": False,
                },
            )
            response.raise_for_status()
            vectors = response.json()["embeddings"]
        if len(vectors) != len(text):
            raise ValueError("Embedding count mismatch")

        for vector in vectors:
            if len(vector) != self.settings.embedding_dimensions:
                raise ValueError("Embedding dimension mismatch")
            if not all(math.isfinite(value) for value in vector):
                raise ValueError("Invalid embedding values")
            if not any(value != 0 for value in vector):
                raise ValueError("Zero vector")

        return vectors

    async def embed_query(self, question: str) -> list[float]:
        text = (
            "Instruct: Given a question, retrieve relevant passages from uploaded documents.\n"
            f"Query: {question}"
        )
        return (await self.embed([text]))[0]
