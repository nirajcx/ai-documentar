# Documentar — document RAG scaffold

Goal: upload multiple documents to the existing MinIO instance, parse/OCR, chunk and embed them in the background, retrieve relevant content from PostgreSQL/pgvector, and provide streamed chat answers with citations and feedback.

**This is currently a scaffold only.** Chat/Documents pages, a disabled composer, API health, database session configuration, Alembic and Celery configuration are in place. Uploads, OCR, embeddings, search, chat generation, authentication and product tables are not implemented. Startup does not contact MinIO or Ollama.

## Folder structure

```text
ai-documentar/
├── frontend/                 # Next.js App Router + TypeScript + Tailwind/shadcn
│   ├── src/
│   │   ├── app/              # /chat, /documents, layout, providers, styles
│   │   ├── components/       # ui/ and layout/
│   │   ├── features/         # chat/ and documents/ future feature modules
│   │   ├── stores/           # Zustand: mobile sidebar state
│   │   └── lib/              # typed API client configuration + utilities
│   ├── public/
│   ├── package.json
│   ├── pnpm-lock.yaml
│   ├── pnpm-workspace.yaml   # single-app pnpm settings
│   ├── .npmrc / .nvmrc
│   ├── components.json
│   ├── Dockerfile
│   ├── .dockerignore
│   └── .env.example
├── backend/                  # FastAPI + SQLAlchemy async + Celery
│   ├── app/
│   │   ├── api/routes/       # GET /api/v1/health only
│   │   ├── core/             # settings + logging
│   │   ├── db/               # Base, session factory, future models/
│   │   ├── schemas/
│   │   ├── services/         # storage/, ingestion/, retrieval/, llm/
│   │   └── workers/          # Celery app + future tasks/
│   ├── migrations/versions/ # no fake migrations
│   ├── tests/
│   ├── alembic.ini
│   ├── pyproject.toml
│   ├── uv.lock
│   ├── requirements.txt     # locked runtime dependencies for pip
│   ├── requirements-dev.txt # locked runtime + development dependencies for pip
│   ├── Dockerfile
│   └── .env.example
├── deployement/              # spelling intentionally matches requested folder name
│   ├── compose.dev.yml       # local source mounts and reload
│   ├── compose.prod.yml      # Ubuntu: built images, no source mounts
│   ├── .env.example          # local development defaults
│   └── .env.ubuntu.example   # Ubuntu setup template
├── docs/
│   ├── ubuntu-setup.md       # clone → env → build → run → update
│   ├── server-cleanup.md     # existing lab containers: inspection + cleanup
│   └── architecture.md      # future data flow and state boundaries
└── README.md
```

The frontend is self-contained: package files, the dependency lockfile, Node configuration and local node_modules all live in `frontend/`. Backend code lives in `backend/`, and Docker orchestration lives in `deployement/`. Each application keeps its Dockerfile in its own directory. Commit dependency lockfiles to Git.

## Running on the Ubuntu homelab

**Clone the same repository and run it with Docker Compose.** Node, pnpm, Python and uv are not required on the deployment host; image builds install application dependencies. You need Docker Engine, Compose v2, Git and internet access during builds.

Your existing containers occupy ports `80`, `8000`, `9000–9001`, `6379`, `8080` and `5432`. The Ubuntu configuration uses **web port 3000 and API port 8001**; it does not publish database or Redis host ports. Removing old containers is not required for startup. Check available memory and disk space as well.

1. Follow the [Ubuntu setup guide](docs/ubuntu-setup.md) for environment values, SSH tunnel/LAN access, MinIO/Mac networking and exact commands.
2. After verifying the new stack, follow the [old server cleanup guide](docs/server-cleanup.md). Preserve `lab-minio` and inspect old database/Keycloak dependencies before deleting anything.

## Environment files

| File | When to use it | URL context |
| --- | --- | --- |
| `frontend/.env.local` | Running Next.js on the host | Browser URL + host-local API |
| `backend/.env` | Running Python commands from `backend/` on the host | Host-local PostgreSQL/Redis |
| `deployement/.env` | Docker development | `postgres`, `redis`, `api` service names |
| `deployement/.env.ubuntu` | Ubuntu production-target Compose | Internal service names + external MinIO/Mac |

Actual `.env*` files are ignored; only examples are tracked. Docker builds exclude secrets. `NEXT_PUBLIC_*` values appear in public browser JavaScript: never put credentials there. `NEXT_PUBLIC_API_URL` is a production build-time value, so rebuild the web image after changing it. `API_INTERNAL_URL=http://api:8000/api/v1` is a server-side address, not a browser URL.

## Installing Python dependencies with pip

`backend/requirements.txt` contains pinned runtime dependencies exported from `backend/uv.lock`. `backend/requirements-dev.txt` includes the runtime dependencies plus test/lint tools. Both retain platform markers. Use Python **3.12**. The `pyproject.toml` and `uv.lock` files remain the source of truth; do not edit the exported files manually.

As an alternative to `uv sync`, run from the repository root:

```sh
python3.12 -m venv backend/.venv
source backend/.venv/bin/activate
python -m pip install -r backend/requirements.txt
# For development and tests, install this file instead:
python -m pip install -r backend/requirements-dev.txt
python -m pip check
```

With the pip environment activated, run backend commands directly from `backend/`: `uvicorn app.main:app --reload`, `celery -A app.workers.celery_app:celery_app worker --loglevel=INFO`, `alembic upgrade head`, `pytest`, or `ruff check .`. The database, Redis and environment setup described below still applies. You do not need uv to use this pip workflow.

After changing Python dependencies and updating `uv.lock`, regenerate both exports from `backend/`:

```sh
uv export --locked --no-dev --no-hashes --output-file requirements.txt
uv export --locked --no-hashes --output-file requirements-dev.txt
```

Frontend dependencies are JavaScript packages, installed separately with `pnpm --dir frontend install --frozen-lockfile`. Docker Compose installs application dependencies while building images; manual pip/pnpm installation is only needed for host development. Requirements files do not install PostgreSQL, Redis, MinIO or Ollama.

## Mac/local development

Host tooling: Node 24 (`frontend/.nvmrc`), pnpm 11.19.0, Python 3.12 and uv 0.12.23. Reuse existing tools where available. Install pnpm if needed with `npm install -g pnpm@11.19.0`. Install uv in your preferred tooling environment with `python3 -m pip install uv==0.12.23`. Run the commands below from the repository root unless a `cd` command specifies otherwise.

First-time setup only; do not overwrite existing environment files:

```sh
cp frontend/.env.example frontend/.env.local
cp backend/.env.example backend/.env
cp deployement/.env.example deployement/.env
pnpm --dir frontend install --frozen-lockfile
uv sync --project backend --locked
```

Full Docker development:

```sh
docker compose --env-file deployement/.env -f deployement/compose.dev.yml config --quiet
docker compose --env-file deployement/.env -f deployement/compose.dev.yml up --build -d
docker compose --env-file deployement/.env -f deployement/compose.dev.yml logs -f web api worker
```

Open http://localhost:3000/chat and http://localhost:8000/api/v1/health. Changes to frontend `src/` and `public/`, and Python `app/`, reload automatically. Restart the worker after changing Celery code; rebuild after changing dependencies or configuration. If local ports are occupied, override `WEB_PORT`, `API_PORT`, `POSTGRES_PORT` and `REDIS_PORT` in the environment file and update matching client URLs/CORS. Use the production Compose file on Ubuntu; the development file publishes database and Redis ports.

To run the applications on the host, start only their containerized dependencies:

```sh
docker compose --env-file deployement/.env -f deployement/compose.dev.yml up -d postgres redis
pnpm --dir frontend dev
```

Separate terminals:

```sh
cd backend
uv run --locked uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

```sh
cd backend
uv run --locked celery -A app.workers.celery_app:celery_app worker --loglevel=INFO --concurrency=2
```

## Migration workflow

No product tables or migrations exist yet; `upgrade head` currently creates no product schema. The image includes pgvector binaries; a future reviewed migration will enable the extension. Import real models from `backend/app/db/models/__init__.py` so Alembic sees their metadata.

With the local database running:

```sh
cd backend
uv run --locked alembic current
# Only after adding real models:
uv run --locked alembic revision --autogenerate -m "describe actual schema change"
# Review the generated migration before applying:
uv run --locked alembic upgrade head
```

API and worker startup do not automatically run migrations. The Ubuntu guide includes a one-off migration command. `uv run --locked alembic upgrade head --sql` performs an offline check without connecting to the database.

## Build/lint/test

Repository root:

```sh
pnpm --dir frontend lint
pnpm --dir frontend typecheck
pnpm --dir frontend build
uv run --project backend --locked ruff check backend
uv run --project backend --locked ruff format --check backend
uv run --project backend --locked pytest backend/tests
docker compose --env-file deployement/.env.example -f deployement/compose.dev.yml config --quiet
# Only synthetic value for configuration validation, never use as deployment credentials:
POSTGRES_PASSWORD=config-check-only docker compose --env-file deployement/.env.ubuntu.example -f deployement/compose.prod.yml config --quiet
```

The health test checks the liveness response and explicit CORS acceptance/rejection without external services. `/api/v1/health` reports process liveness, not dependency readiness.

## Future implementation workflow

1. Define authentication/authorization and actual document/conversation schemas; add reviewed migrations.
2. Implement storage integration with existing MinIO, authorized uploads and document status.
3. Integrate Docling/OCR, chunking and embeddings into Celery jobs. No model weights or OCR/model runtimes are installed yet.
4. Add PostgreSQL/pgvector retrieval, then connect to Mac Ollama using async httpx.
5. Add POST Fetch streaming, AbortController cancellation, correctly framed SSE, source citations and feedback.

TanStack Query will manage persisted documents and conversations. Use Zustand/local state for UI, selections and temporary stream state; do not duplicate permanent server data. See [architecture](docs/architecture.md).

**The production target is not ready for public deployment:** authentication, HTTPS/reverse proxy, secret management, rate limits, monitoring and backups remain pending. An SSH tunnel is the default homelab access method; direct LAN access is optional.

## Git push

Actual environment files, installed dependencies, caches and local data are ignored. Review changes before committing:

```sh
git status --short
git add README.md .gitignore .editorconfig frontend backend deployement docs
git diff --cached --stat
git diff --cached
# After reviewing:
git commit -m "Organize RAG scaffold and add Ubuntu deployment guide"
# Use your actual configured remote and branch:
git push -u origin HEAD
```

If no remote is configured, run `git remote add origin YOUR_REPOSITORY_URL` with your actual repository URL first. The scaffold task has not created commits, configured remotes or pushed changes.
