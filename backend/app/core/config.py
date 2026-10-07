from functools import lru_cache
from typing import Literal

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore", env_ignore_empty=True
    )

    environment: Literal["development", "production", "test"] = "development"
    log_level: str = "INFO"
    cors_origins: list[str] = ["http://localhost:3000"]
    database_url: SecretStr = SecretStr(
        "postgresql+asyncpg://documentar:development-only@localhost:5432/documentar"
    )
    redis_url: SecretStr = SecretStr("redis://localhost:6379/0")
    s3_endpoint_url: str = "http://localhost:9000"
    s3_access_key_id: SecretStr = SecretStr("")
    s3_secret_access_key: SecretStr = SecretStr("")
    s3_bucket: str = "documentar"
    s3_region: str = "us-east-1"
    chat_provider: Literal["groq", "ollama"] = "groq"
    groq_api_key: SecretStr = SecretStr("")
    groq_model: str = "openai/gpt-oss-120b"
    groq_reasoning_effort: Literal["low", "medium", "high"] = "low"
    groq_max_completion_tokens: int = Field(default=2048, ge=1, le=65536)
    ollama_chat_model: str = "llama3.1:8b"
    rate_limit_enabled: bool = False
    request_max_bytes: int = Field(default=26 * 1024 * 1024, ge=1024)
    web_search_enabled: bool = False
    tavily_api_key: SecretStr = SecretStr("")
    web_search_max_results: int = Field(default=5, ge=1, le=8)
    web_search_timeout_seconds: float = Field(default=15, ge=1, le=30)
    rag_enabled: bool = False
    embedding_model: str = "qwen3-embedding:0.6b"
    embedding_dimensions: int = Field(default=1024, ge=1024, le=1024)
    embedding_batch_size: int = Field(default=8, ge=1, le=32)
    rag_max_distance: float = Field(default=0.65, ge=0, le=2)
    document_max_count: int = Field(default=100, ge=1)
    document_quota_bytes: int = Field(default=500 * 1024 * 1024, ge=1)
    ollama_base_url: str = "http://localhost:11434"


@lru_cache
def get_settings() -> Settings:
    return Settings()
