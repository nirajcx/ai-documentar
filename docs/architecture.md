# Architecture boundaries

The Next.js frontend calls FastAPI under `/api/v1`. FastAPI owns authentication, documents and conversation history; a separate Celery worker indexes PDFs. PostgreSQL stores users, sessions, chats, documents, chunks and pgvector embeddings. Redis delivers jobs and shares request counters. Private S3/MinIO holds original PDFs. Ollama supplies embeddings; Groq or Ollama supplies answers.

## Ingestion

Authenticated multipart upload → bounded body/PDF validation → account quota and SHA-256 dedupe → private object storage → committed `queued` document row → beat dispatch task → worker atomic lease claim → parse → page-aware chunks → embedding batches → atomic ready publication.

The document row is the durable queue intent. Redis publication failures leave it queued for subsequent dispatch. Celery may deliver repeatedly, so job tokens, version checks and expiring leases guard writes. Hard-killed jobs can be reclaimed after the lease expires. A dedicated `documentar` queue separates ingestion from unrelated Celery workloads. Run exactly one beat scheduler for each deployment.

## Answer generation

Authenticated question + 1–20 selected ready document IDs → authorize every document and index compatibility → embed a bounded question with recent user context → owner-filtered exact cosine retrieval → bounded evidence/source map → model generation → citation validation → atomic answer/citation persistence → SSE content/citations/done.

General chat streams incrementally. RAG output is buffered until source labels validate and the database commit succeeds. Unknown sources and unsupported uncited assertions fail rather than silently falling back. A saved citation is a JSONB snapshot, so deleting the PDF does not erase its historic excerpt. Valid labels do not establish semantic correctness of every claim.

## Boundaries

- Routes: authentication and HTTP contracts; services: orchestration; repositories: database access.
- Parser: disposable subprocess with wall/CPU limits, Linux memory limit, page/text/size limits. No OCR engine is installed.
- Embedding client: `/api/embed`, no silent truncation, count/dimension/finite/nonzero checks, model digest compatibility.
- Session validation: PostgreSQL expiry/revocation/account state is authoritative on every request. Redis cache entries cannot authorize users.
- Limits: 25 MB PDF, 26 MB HTTP body, account count/bytes quota. Optional shared Redis throttles; configured production runtime enables them and fails closed when Redis is unavailable.
- Browser state: document selection and temporary generation state are local. Database remains authoritative for saved documents/messages/citations.
- `/health`: process liveness. `/ready`: database migration/extension, Redis, dispatcher heartbeat, storage bucket and embedding model availability. It does not probe the chat provider or replace end-to-end tests.
- The dispatcher heartbeat proves a scheduled task reached a worker. A stale heartbeat makes readiness fail; it does not itself restart a process. Docker restart policies handle process exits, not every possible deadlock.

## Deployment choices

`compose.runtime.yml` is the app-only runtime for existing infrastructure; it must not create or upgrade a database volume. Local environment generation translates localhost dependency endpoints into `host.docker.internal`. `compose.prod.yml` provisions a separate PostgreSQL 17/Redis stack for a new installation. The current existing Docker database is PostgreSQL 18. These are separate deployment choices: never mount a PG18 volume into PG17.

Migrations run as an explicit administrative step after backup. Production API cookies require Secure/HTTPS (localhost browser exceptions are browser-dependent). Public serving still requires a domain, TLS reverse proxy, access/network configuration, off-host backup retention and monitoring. See [operations](operations.md).
