# 01 — Application foundation and deployable workspace

**What to build:** A runnable web, worker, and administration workspace with version-controlled database migrations, shared validation and domain boundaries, local test execution, deployment health checks, and a minimal end-to-end smoke path. This creates the seams needed for later slices without implementing product feature logic.

**Blocked by:** None — can start immediately.

**Status:** prototype-implemented

- [x] A consumer web application, durable processing worker, and administration application can be installed, started, and built through the project toolchain.
- [x] Shared domain and validation packages can be imported by the applications without duplicating core types.
- [x] Database schema changes are represented by version-controlled migrations and can be applied to an isolated environment.
- [x] A minimal health or smoke flow proves that the web application, worker boundary, and database can communicate.
- [x] Tests run in a clean environment and fail clearly when the foundation is broken.
- [x] The workspace has documented local development and validation commands without inventing unverified production guarantees.

## Verification

Prototype-implemented and covered by `tests/platform.test.ts` / `tests/foundation.test.ts` (in-memory, no real DB/ingestion/UI). Not production-resolved; real infra, security, and the legal de-risk (ADR-0001) are required before this is live.
