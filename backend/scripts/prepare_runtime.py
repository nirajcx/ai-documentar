"""Write a private Docker env file from existing local settings, without logging secrets."""

import json
import os
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit

from sqlalchemy.engine import make_url

from app.core.config import get_settings


def docker_url(value):
    parts = urlsplit(value)
    if parts.hostname in {"localhost", "127.0.0.1"}:
        return urlunsplit(
            parts._replace(netloc=parts.netloc.replace(parts.hostname, "host.docker.internal"))
        )
    return value


def main():
    settings = get_settings()
    values = {}
    for key, value in settings.model_dump().items():
        if hasattr(value, "get_secret_value"):
            value = value.get_secret_value()
        values[key.upper()] = value
    url = make_url(values["DATABASE_URL"])
    if url.host in {"localhost", "127.0.0.1"}:
        url = url.set(host="host.docker.internal")
    values["DATABASE_URL"] = url.render_as_string(hide_password=False)
    for name in ["REDIS_URL", "S3_ENDPOINT_URL", "OLLAMA_BASE_URL"]:
        values[name] = docker_url(values[name])
    values.update(
        ENVIRONMENT="production",
        RAG_ENABLED=True,
        RATE_LIMIT_ENABLED=True,
        CORS_ORIGINS=["http://localhost:3001", "http://localhost:3000"],
    )
    target = Path(__file__).resolve().parents[2] / "deployement/.env.runtime"
    # Single-quoted dotenv prevents Compose interpolation of credentials containing $.
    lines = []
    for key, value in values.items():
        if isinstance(value, (list, bool)):
            value = json.dumps(value)
        value = str(value)
        if "\n" in value or "\r" in value:
            raise ValueError("Multiline configuration cannot be exported")
        lines.append(key + "='" + value.replace("'", "\\'") + "'")
    fd = os.open(target, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    os.chmod(target, 0o600)
    with os.fdopen(fd, "w") as f:
        f.write("\n".join(lines) + "\n")
    print("Private runtime configuration written; credentials were not printed.")


if __name__ == "__main__":
    main()
