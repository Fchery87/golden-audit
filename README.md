# Personal Credit Analysis & Education Platform

Foundation workspace for the invite-only, evidence-first product described in the project spec.

Current posture: the product aims to be a U.S.-only educational credit-report analysis platform, but **nationwide availability is not yet validated**. The current repo posture supports an invite-only, analysis-only boundary and a **one-state-at-a-time reviewed launch scope**, not a blanket 50-state clearance claim.

## Local commands

```sh
npm install
npm run typecheck
npm test
npm run db:migrate
npm run health
npm run verify:pilot
npm run build
```

`npm run health` starts the web, worker, and administration boundaries on temporary local ports and verifies their health responses. It also reports the latest migration version. `npm run verify:pilot` runs the complete automated pilot gate. These commands do not claim production deployment, legal, vendor, accessibility-certification, or security guarantees; the human gates are documented in `docs/pilot-readiness.md`. Research on product boundary and state-law posture lives in `docs/nationwide-legal-regulatory-posture-brief.md`, `docs/product-boundary-positioning-update.md`, `docs/copy-boundary-guide.md`, `docs/50-state-review-tracker.md`, `docs/launch-scope-decision-memo.md`, `docs/launch-scope-checklist-index.md`, `docs/one-state-launch-selection-memo.md`, `docs/launch-scope-field-schema.md`, and `docs/onboarding-copy-approved-state-pilot.md`.

Run an individual boundary with `npm run dev:web`, `npm run dev:worker`, or `npm run dev:admin`. The default ports are 3000, 3001, and 3002 respectively.

The web boundary now exposes:
- `GET /health` — health status
- `GET /pilot-availability?state=CA` — approved-state gating response derived from the configured launch scope
- `GET /` — onboarding-state copy and current pilot-scope summary for the app shell
- `GET /app` — minimal browser-facing pilot shell over the current API
- `POST /consumer/register` — create a consumer session for the bounded pilot API
- `POST /consumer/consent` — record approved-state consent using `x-session-id`
- `POST /consumer/authorization` — record the standalone written authorization using `x-session-id`
- `POST /consumer/uploads/init` — initialize an upload token using `x-session-id`
- `POST /consumer/uploads/complete` — complete an upload with base64 content
- `POST /consumer/uploads/:uploadId/kickoff-analysis` — parse, review, match, analyze, and generate a consumer report/export for the smallest supported flow
- `POST /consumer/matches/:matchId/decision` — manually change a proposed match state
- `POST /consumer/matches/:matchId/confirm-subgroup` — confirm a subgroup from an oversized collision set
- `GET /consumer/analyses/:analysisId` — fetch analysis results
- `GET /consumer/reports/:consumerReportId` — fetch the consumer-facing report
- `GET /consumer/exports/:exportId` — fetch a generated export artifact

## Workspace boundaries

- `apps/web`: consumer web boundary.
- `apps/worker`: durable processing boundary placeholder.
- `apps/admin`: administration boundary placeholder.
- `packages/domain`: shared domain contracts.
- `packages/validation`: shared input validation.
- `database/migrations`: version-controlled schema migrations.

The foundation intentionally does not implement product feature logic. Later tickets add account, ingestion, parsing, rules, analysis, reporting, export, and governed narration slices.
