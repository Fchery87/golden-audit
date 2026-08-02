# ADR-0005: Durable processing seam before dispatcher activation

- **Status:** Accepted for local implementation; external dispatcher activation deferred
- **Date:** 2026-08-01

## Context

The current Pages kickoff route owns parsing, review transition, matching, analysis, report generation, and export generation in one request. The product specification requires a durable lifecycle rather than short-lived request processing. A Cloudflare Queue (or equivalent) needs an account-side binding and a recovery drill; repository code cannot truthfully claim that work continues after a Pages response.

## Decision

Introduce a persistent `ProcessingJob` state machine keyed by the accepted upload before activating any external dispatcher.

States: `queued`, `processing`, `value-review-required`, `match-review-required`, `completed`, `retryable-failure`, and `final-failure`.

The store must support idempotent creation/find by upload, atomic lease claim, bounded attempts, lease-expiry reclamation, terminal-state immutability, and deletion with the subject's data. Processing logic must be extracted behind a reusable processor. Pages may synchronously invoke that processor during the seam phase, but returns the job state rather than claiming background work.

## Consequences

- Retrying kickoff cannot create duplicate canonical reports or match sets for the same upload.
- Waiting-for-consumer states are terminal waiting states, not automatic retry failures.
- The local Node/D1/in-memory implementations and migration must stay compatible.
- Actual post-response execution is not enabled until an operator provisions a Queue/dispatcher binding, applies the remote migration, and records a failure/recovery drill.
