# Architecture boundaries

`frontend` is a Next.js App Router UI. `backend` owns FastAPI HTTP routes and the separately started Celery worker. PostgreSQL (pgvector-capable) and Redis are Compose services. MinIO and native Mac Ollama remain external. The scaffold has no product tables or integration calls.

Future flow: browser → API → existing MinIO for documents; API → Redis/Celery for ingestion; workers → parsing/OCR → chunks/embeddings → PostgreSQL; API → retrieval and external Ollama → streamed answers and citations. Exact upload authorization, job reliability, embedding model and schemas remain design work.

- `app/api/routes`: versioned HTTP endpoints. Only health exists.
- `app/db/models`, `migrations/versions`: future SQLAlchemy models and reviewed migrations. `Base` only establishes shared metadata and naming conventions.
- `app/schemas`: future request/response contracts.
- `app/services/storage`, `ingestion`, `retrieval`, `llm`: future boto3, Docling/OCR, embeddings/vector retrieval, and async httpx integrations respectively.
- `app/workers/tasks`: future Celery jobs. No sample jobs or scheduled work.
- `src/features/chat`, `documents`: future feature-specific UI/hooks. Empty until needed.

Persisted documents/conversations belong to the server; TanStack Query will fetch, cache and mutate them. Sidebar state, selection and temporary stream state belong in local React state or Zustand as appropriate. Do not duplicate permanent server data in Zustand. The current store contains only mobile navigation state; the query provider makes no requests.

Future chat transport: POST using Fetch streaming and AbortController. Consume correctly framed SSE: decode incrementally across network chunks, retain incomplete frames, handle CRLF/LF and multi-line `data:` fields, and parse only complete events. Define completion/error events and cancellation behavior. Do not assume each read is an event or rely on GET-only EventSource for POST. No streaming implementation exists yet.

Health is process liveness only. Application startup does not reach storage, models or the database. Workers use Redis for job delivery and currently ignore task results; eventual durable job status belongs in PostgreSQL. Alembic runs as one explicit administrative step, never concurrently in API/worker startup. pgvector is available in the image but not enabled by a fake migration.
