# Ubuntu homelab setup

This guide covers the existing Docker host at `niraj@homelab`. After pushing the repository, clone it on that host. **Scaffold only:** working pages and health checks do not mean document RAG is implemented. Run commands from the repository root unless stated otherwise.

## 1. Host prerequisites

Docker is already running; reinstalling or upgrading it is not required. Check:

```sh
docker version
docker compose version
git --version
free -h
df -h
ss -ltn
```

Missing basic tools only:

```sh
sudo apt update
sudo apt install -y git curl openssl
```

If `docker compose` is missing and the official Docker apt repository is already configured, run `sudo apt install docker-compose-plugin docker-buildx-plugin`. Otherwise, follow the [official Ubuntu installation guide](https://docs.docker.com/engine/install/ubuntu/) for your installation source. Do not blindly replace the working Docker installation. Node and Python are not required on the host for Compose deployment.

## 2. Clone and env

Replace `YOUR_REPOSITORY_URL` with your actual Git repository URL:

```sh
mkdir -p ~/projects
cd ~/projects
git clone YOUR_REPOSITORY_URL ai-documentar
cd ai-documentar
umask 077
cp deployement/.env.ubuntu.example deployement/.env.ubuntu
chmod 600 deployement/.env.ubuntu
openssl rand -hex 24
nano deployement/.env.ubuntu
```

Paste the generated password into `POSTGRES_PASSWORD=`. Compose interpolates `DATABASE_URL` from the preceding variables in the same file; do not configure a different password there. A hexadecimal password is URL-safe. Changing an environment value does not rotate the password in an existing database volume.

Set these values:

| Variable | Value/purpose |
| --- | --- |
| `POSTGRES_PASSWORD` | Required generated password for **new Documentar DB** |
| `BIND_ADDRESS` | Default `127.0.0.1` for SSH tunnel; optional LAN IP below |
| `WEB_PORT` / `API_PORT` | `3000` / `8001`; old `80` / `8000` untouched |
| `NEXT_PUBLIC_API_URL` | Browser-reachable address, default `http://localhost:8001/api/v1` for tunnel |
| `CORS_ORIGINS` | Exact UI browser origin as JSON, default `["http://localhost:3000"]` |
| `S3_ENDPOINT_URL` | `http://host.docker.internal:9000` for existing Ubuntu `lab-minio` host-published port |
| `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` | Your existing MinIO application credentials, never `NEXT_PUBLIC_*` |
| `S3_BUCKET` / `S3_REGION` | Your intended bucket/region; scaffold creates neither |
| `OLLAMA_BASE_URL` | `http://MAC_LAN_OR_VPN_IP:11434`, replace placeholder |

Storage credentials can stay blank for scaffold-only startup. No service probes or modifies MinIO/Ollama. Credentials and actual `.env.ubuntu` must not be pushed.

## 3. Build and start

Define this shell helper in the current terminal (repeat after a new login):

```sh
cd ~/projects/ai-documentar
dc() { docker compose --env-file deployement/.env.ubuntu -f deployement/compose.prod.yml "$@"; }

dc config --quiet
dc build
dc up -d --wait postgres redis
dc run --rm --no-deps api alembic upgrade head
dc up -d --wait
dc ps
curl --fail http://127.0.0.1:8001/api/v1/health
curl --fail --output /dev/null http://127.0.0.1:3000/chat
```

Expected API response: `{"status":"ok"}`. No fake migration exists; later releases will apply actual reviewed migrations through this single one-off command. Do not put migration execution into every API/worker startup.

Project name is `documentar-prod`; Compose creates isolated network and named volumes (`documentar-prod_postgres-data`, `documentar-prod_redis-data` under the default project name). No `container_name` collisions. PostgreSQL 17 + pgvector uses a **new** volume, not the existing PostgreSQL 16 volume. Never mount `lab-db-1`'s PG16 data directory into PG17. Redis is also dedicated; existing queues/key prefixes aren't reused.

No services bind `80`, `8000`, `9000`, `9001`, `6379`, `8080` or `5432` on the Ubuntu host. There is no need to delete old containers before trying this scaffold.

## 4. Open from your Mac

### Default: SSH tunnel

Run on the **Mac**, keep the terminal open:

```sh
ssh -N -o ExitOnForwardFailure=yes -L 3000:127.0.0.1:3000 -L 8001:127.0.0.1:8001 niraj@homelab
```

If `homelab` doesn't resolve, replace it with Ubuntu's LAN/VPN IP. Stop local apps already using Mac ports 3000/8001, or deliberately choose matching tunnel ports and update browser URLs/CORS accordingly.

Open http://localhost:3000/chat, http://localhost:3000/documents and http://localhost:8001/docs on the Mac. The SSH tunnel connects these browser-local ports to Ubuntu. Closing tunnel stops browser access, not containers.

### Optional: direct trusted LAN access

On Ubuntu, `hostname -I` helps identify its LAN IP. Example only: if Ubuntu IP is `192.168.1.50`, edit `.env.ubuntu`:

```dotenv
BIND_ADDRESS=192.168.1.50
WEB_PORT=3000
API_PORT=8001
NEXT_PUBLIC_API_URL=http://192.168.1.50:8001/api/v1
CORS_ORIGINS=["http://192.168.1.50:3000"]
```

Then:

```sh
dc build web
dc up -d --wait
curl --fail http://192.168.1.50:8001/api/v1/health
```

Browser: `http://192.168.1.50:3000/chat`. Use your actual IP, not the example. After binding only to the LAN IP, use that IP for host curl checks too. If using a hostname in browser, its exact origin must be in CORS. Public API URL changes require frontend **rebuild**, not just restart.

This exposes an unauthenticated scaffold to that reachable network. Keep it on a trusted LAN/VPN; no router port forwarding. Docker-published ports may bypass ordinary UFW rules; do not assume a UFW rule alone protects them. See [Docker port publishing](https://docs.docker.com/engine/network/port-publishing/) and [Ubuntu firewall caveats](https://docs.docker.com/engine/install/ubuntu/#firewall-limitations). HTTPS/auth/reverse proxy are future work.

## 5. MinIO and native Mac Ollama

`lab-minio` stays running on Ubuntu ports 9000/9001. S3 API is 9000, console is 9001. Our API/worker map `host.docker.internal` to the Ubuntu Docker host gateway. They use its published MinIO API; joining the old Compose network is not required. Host firewall/routing must permit that bridge-to-host connection. `localhost:9000` **inside the API container** would address the API container, not MinIO.

For Ollama, Ubuntu's `host.docker.internal` does **not** mean your Mac. Use a Mac LAN/VPN address reachable from Ubuntu. The Mac must stay awake, Ollama must listen on that reachable interface, and its firewall must allow the Ubuntu host. For a manually managed Ollama process, configure `OLLAMA_HOST` in its launch environment (e.g. `OLLAMA_HOST=0.0.0.0:11434 ollama serve`); don't launch a second server if the native app already manages one. Limit access to trusted hosts/VPN. This scaffold does not install Ollama, change its configuration or download models.

Future connectivity checks, only when you are ready to contact these services:

```sh
# Ubuntu host; these are read-only health/list requests.
curl --fail http://127.0.0.1:9000/minio/health/live
# Replace MAC_IP with the actual address:
curl --fail http://MAC_IP:11434/api/tags
```

A successful host request doesn't prove Docker bridge access; use a container-side read-only check later if integration fails. No generation calls are implemented yet.

## 6. Daily operation and updates

```sh
dc ps
dc logs --tail=100 api worker web
dc logs -f api worker
# After a temporary stop:
dc stop
dc start
```

Update from Git after reviewing release/schema changes. Back up database before migrations:

```sh
umask 077
mkdir -p ~/backups/documentar
dc exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > ~/backups/documentar/database-$(date +%Y%m%d-%H%M%S).dump
# Verify command success and keep a tested restore procedure before relying on this backup.
git pull --ff-only
dc build
# Maintenance window: prevent old code from querying a changing schema.
dc stop web api worker
dc run --rm --no-deps api alembic upgrade head
# Continue only when migration succeeds:
dc up -d --wait
```

If migration fails, inspect logs and fix/recover before restarting application services. Do not blindly rerun destructive migrations. Version-dependent restore/downgrade needs planning; copying an image back doesn't undo DB schema changes. `.env.ubuntu` remains local across `git pull`. Keep MinIO backup lifecycle separate; uploads will live there in future.

```sh
# Remove this stack's containers/network, retaining database/Redis data:
dc down
```

`dc down -v` would permanently delete this project's DB/Redis volumes: it is not part of updates. External MinIO is not managed by this Compose stack. Old stack cleanup: [server-cleanup.md](server-cleanup.md).

## 7. Troubleshooting

- **Missing password / config error:** edit `.env.ubuntu`; validate with `dc config --quiet`. Avoid posting full `dc config` output because it contains resolved secrets.
- **Port already allocated:** check `ss -ltn`, change `WEB_PORT`/`API_PORT` and matching public URL/CORS; rebuild web when its URL changes.
- **Browser API/CORS failure:** browser needs Ubuntu LAN address or SSH-tunnel localhost, never `http://api:8000`.
- **Unhealthy service:** `dc ps`, then `dc logs --tail=100 SERVICE`. Health is process-level; API health does not prove DB/MinIO/Ollama integration.
- **Build killed:** check `free -h`/`df -h`; frontend build needs memory and downloads. Build one image at a time or adjust host resources based on logs.
- **Mac not reachable:** check IP, VPN/routing, sleep, Ollama listen interface and firewall; don't change Docker service names to solve external routing.

Local scaffold checks can pass without Docker. Image builds, Linux runtime, worker health, database startup and host-to-container routing must still be verified on your Ubuntu host; the editing environment had no running Docker daemon.
