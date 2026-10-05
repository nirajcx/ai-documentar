import json
from collections.abc import AsyncIterator
from typing import cast

from openai import AsyncOpenAI
from openai.types.chat import ChatCompletionMessageParam

from app.core.config import Settings


class GroqGenerationError(Exception):
    """The provider did not return a complete answer."""


class GroqService:
    """Groq Chat Completions through the OpenAI SDK; never used for embeddings."""

    def __init__(self, settings: Settings):
        self.settings = settings
        if not settings.groq_api_key.get_secret_value().strip():
            raise ValueError("Set GROQ_API_KEY in the backend environment to use Groq chat.")

    def _client(self) -> AsyncOpenAI:
        # Explicit endpoint prevents accidentally sending Groq credentials to OpenAI.
        return AsyncOpenAI(
            api_key=self.settings.groq_api_key.get_secret_value(),
            base_url="https://api.groq.com/openai/v1",
            timeout=120.0,
            max_retries=0,
        )

    def _options(self, model: str) -> dict:
        options = {"max_completion_tokens": self.settings.groq_max_completion_tokens}
        if model in {"openai/gpt-oss-120b", "openai/gpt-oss-20b"}:
            options["reasoning_effort"] = self.settings.groq_reasoning_effort
            options["extra_body"] = {"include_reasoning": False}
        return options

    async def chat(self, messages: list[dict[str, str]], model: str) -> dict:
        async with self._client() as client:
            result = await client.chat.completions.create(
                model=model,
                messages=cast(list[ChatCompletionMessageParam], messages),
                **self._options(model),
            )
            if not result.choices or result.choices[0].finish_reason != "stop":
                raise GroqGenerationError("Groq did not finish the answer. Try a shorter question.")
            return {
                "message": {"content": result.choices[0].message.content or ""},
                "model": result.model,
                "done": True,
            }

    async def stream_chat(self, messages: list[dict[str, str]], model: str) -> AsyncIterator[str]:
        async with self._client() as client:
            stream = await client.chat.completions.create(
                model=model,
                messages=cast(list[ChatCompletionMessageParam], messages),
                stream=True,
                **self._options(model),
            )
            finished = False
            # Both stream and HTTP client close on completion, errors or cancellation.
            async with stream:
                async for chunk in stream:
                    if not chunk.choices:
                        continue
                    choice = chunk.choices[0]
                    if choice.delta.content:
                        yield f"data: {json.dumps({'content': choice.delta.content})}\n\n"
                    if choice.finish_reason is not None:
                        if choice.finish_reason != "stop":
                            raise GroqGenerationError(
                                "Groq did not finish the answer. Try a shorter question."
                            )
                        finished = True
            if not finished:
                raise GroqGenerationError("Groq disconnected before completing the answer.")
            yield f"data: {json.dumps({'done': True})}\n\n"
