# 09 — Durable processing seam

Type: task
Status: needs-info
Blocked by: external dispatcher binding and recovery-drill evidence

## Decision record

2026-08-01: Local seam design is captured in `docs/adr/0005-durable-processing-seam.md`. Implementation remains intentionally deferred until an accountable operator chooses and provisions the Cloudflare dispatcher binding and can perform a recovery drill. Repository code must not claim durable post-response execution without that evidence.

## Goal

Create a durable, idempotent processing-job seam for upload parsing and analysis. Pages should initiate/status jobs rather than embody the complete lifecycle in a short-lived request.

## Scope after dependencies

- Define processing states, leases, retryability, idempotency, and consumer-safe errors.
- Add store parity/migration support for jobs.
- Extract processing into a reusable processor, initially callable synchronously for local verification.
- Define the external dispatcher binding interface without claiming queue-backed execution until provisioned and rehearsed.

## Required external decision

Choose and provision the Cloudflare durable execution resource (for example, a Queue consumer) and its deployment binding. This cannot be completed from repository code alone.

## Acceptance criteria

- Repeated kickoff is idempotent and cannot duplicate reports/matches.
- Lease/retry and terminal waiting states are testable across local persistence restarts.
- Real background processing is not claimed until the configured dispatcher and recovery drill have evidence.
