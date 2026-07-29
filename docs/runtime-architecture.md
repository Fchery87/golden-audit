# Production Runtime Architecture

## Goal
Provide a small, honest production path for the pilot: a web boundary, a worker boundary, an admin boundary, and a durable runtime store that can survive restarts.

## Current implementation shape
- `apps/web`: consumer API + browser app shell
- `apps/worker`: background processing boundary placeholder
- `apps/admin`: admin/ops boundary placeholder
- `packages/platform`: domain + analysis coordination state
- `apps/web/src/runtime-store.ts`: SQLite-backed runtime persistence seam

## Runtime responsibilities
### Web boundary
- user registration and approved-state consent
- written authorization capture
- upload lifecycle and analysis kickoff
- browser-facing pilot shell at `/app`
- local runtime persistence

### Worker boundary
- future async processing, retries, queue work, and background verification
- should remain stateless except for durable job inputs/outputs

### Admin boundary
- future operator actions, health/ops views, and release gates
- should remain read-mostly and auditable

## Persistence
- Pilot runtime state is stored in a local SQLite file under the persistence directory.
- The persistence directory defaults to `.scratch/runtime/web`.
- The SQLite file is `runtime.sqlite`.
- This is a production-shaped seam, but still local-file backed in this repo.

## Environment variables
- `WEB_PORT` — web port
- `WORKER_PORT` — worker port
- `ADMIN_PORT` — admin port
- `PILOT_PERSISTENCE_DIR` — runtime storage directory
- `PILOT_APPROVAL_RECORD_PATH` — approval fixture path

## Deployment notes
- The repo does not yet encode a cloud target.
- Any real deployment should move the SQLite file to durable storage, add backups, and define the process manager separately from code.
- Do not claim production readiness from this document alone.
