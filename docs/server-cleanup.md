# Existing homelab containers: inspect, then retire

The new Documentar stack uses ports 3000/8001 and private database/Redis ports, so cleanup is optional. `docker ps` alone cannot confirm actual usage, volume ownership, dependencies or backups. These commands are for **you to run on Ubuntu**; nothing here was executed against your server.

| Existing container | Required by the new project? | Recommended action |
| --- | --- | --- |
| `lab-minio` | Yes, existing document storage | Keep container, image, volumes/bind mounts and network |
| `lab-frontend` | No; belongs to older app | Retire if older app is no longer needed |
| `lab-backend` | No; belongs to older app | Retire with its frontend after checking usage |
| `lab-redis` | New stack has its own Redis | Remove only if no old app/job uses it |
| `lab-keycloak` | Not integrated in current scaffold | Keep if other apps use login; otherwise retire after backup |
| `lab-db-1` | New stack has its own PG17/pgvector DB | Keep until old app/Keycloak dependencies and backups verified |

Keycloak may depend on `lab-db-1`; don't assume the old database only belongs to the old FastAPI app. New project currently has no replacement authentication. Do not delete old Compose directories: MinIO may use build files, mounted config or relative data paths from them.

## 1. Save inventory before deleting anything

```sh
umask 077
mkdir -p ~/backups/old-lab
docker ps -a > ~/backups/old-lab/containers.txt
docker inspect lab-frontend lab-backend lab-minio lab-redis lab-keycloak lab-db-1 > ~/backups/old-lab/inspect.json
docker volume ls > ~/backups/old-lab/volumes.txt
```

`inspect.json` can contain credentials: keep it private and out of Git/chat. Identify Compose ownership and mounts without dumping env secrets:

```sh
docker inspect --format '{{.Name}} project={{index .Config.Labels "com.docker.compose.project"}} service={{index .Config.Labels "com.docker.compose.service"}} config={{index .Config.Labels "com.docker.compose.project.config_files"}}' lab-frontend lab-backend lab-minio lab-redis lab-keycloak lab-db-1

docker inspect --format '{{.Name}}{{range .Mounts}}{{printf "\n  type=%s name=%s source=%s destination=%s" .Type .Name .Source .Destination}}{{end}}' lab-frontend lab-backend lab-minio lab-redis lab-keycloak lab-db-1
```

Read the original Compose files locally to see who uses which DB/Redis/Keycloak. Retain the MinIO service/config and any data paths. Container writable-layer files are lost when a container is removed; copy any needed files with `docker cp CONTAINER:/exact/path ~/backups/old-lab/` first.

## 2. Back up old database before retiring it

If the original Postgres container uses its standard `POSTGRES_USER` admin role:

```sh
umask 077
docker exec lab-db-1 sh -c 'pg_dumpall -U "${POSTGRES_USER:-postgres}"' > ~/backups/old-lab/postgres-all-$(date +%Y%m%d-%H%M%S).sql
```

Check exit status and validate a restore before removing source data. If authentication fails, use the original deployment's configured admin credentials locally; do not assume this backup succeeded. Dump can contain role/password data. Back up Keycloak realm/database state and needed Redis queue/state using their original deployment procedures. MinIO data/config must remain preserved independently.

## 3. Remove only the old frontend/backend

Run only if the old UI/API are intentionally retired. This stops that old application:

```sh
docker stop lab-frontend lab-backend
docker rm lab-frontend lab-backend
# Optional: remove their now-unused images; no --force.
docker image rm fastapi-nextjs-t-frontend fastapi-nextjs-t-backend
```

These commands preserve attached volumes, but container writable layers are deleted. If an image is still referenced, Docker refuses removal; investigate instead of forcing it. Existing MinIO continues running.

Do **not** run `docker compose down` on the whole old project if it also owns `lab-minio`: that would stop/remove MinIO too. Before a later old-project `up`, remove/disable retired services in its Compose config so they aren't recreated, preserving MinIO configuration and paths.

## 4. Optional: retire old Redis, Keycloak and database

**Only if you have confirmed no remaining users/dependencies and verified backups.** These are separate operations, not mandatory setup:

```sh
# Old background jobs/queue users must already be retired:
docker stop lab-redis
docker rm lab-redis

# Only when no app needs the old login service:
docker stop lab-keycloak
docker rm lab-keycloak

# Last: only when old app, Keycloak and all other DB clients are retired:
docker stop lab-db-1
docker rm lab-db-1
```

Optional unused image cleanup (without force):

```sh
docker image rm redis:7-alpine quay.io/keycloak/keycloak:24.0.5 postgres:16
```

This does not remove old persistent volumes. Retain them for recovery until you're certain the data is no longer needed.

## 5. Permanent data cleanup, explicitly selected volumes only

Container names do not tell us the volume names. Use the saved inventory; **never guess** a volume name or remove anything belonging to MinIO/new Documentar/another service.

For a volume you have identified as exclusively obsolete, substitute its exact name below (examples are placeholders, not runnable targets):

```sh
docker volume inspect EXACT_OBSOLETE_VOLUME_NAME
docker ps -a --filter volume=EXACT_OBSOLETE_VOLUME_NAME
# After checking ownership, backups and all mounts:
docker volume rm EXACT_OBSOLETE_VOLUME_NAME
```

Volume removal permanently deletes that volume's data. An empty `docker ps` filter alone is not proof that data is unnecessary. Docker refuses a volume still attached to a container. Bind-mounted data is a host directory, not a Docker volume: retain it and archive/review its exact path separately; no blanket `rm -rf` is provided.

Do not run `docker system prune --all --volumes`, `docker volume prune`, or delete `/var/lib/docker` for this migration. Other projects and MinIO may depend on that state. Container/image removal and volume removal are separate operations; see [Docker removal documentation](https://docs.docker.com/reference/cli/docker/container/rm/).

## 6. Verify remaining services

```sh
docker ps
# Keep lab-minio visible and healthy; new project check:
cd ~/projects/ai-documentar
docker compose --env-file deployement/.env.ubuntu -f deployement/compose.prod.yml ps
```
