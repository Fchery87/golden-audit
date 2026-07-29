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

`npm run health` starts the web, worker, and administration boundaries on temporary local ports and verifies their health responses. It also reports the latest migration version. `npm run verify:pilot` runs the complete automated pilot gate. These commands do not claim production deployment, legal, vendor, accessibility-certification, or security guarantees; the human gates are documented in `docs/pilot-readiness.md`. Research on product boundary and state-law posture lives in `docs/nationwide-legal-regulatory-posture-brief.md`, `docs/product-boundary-positioning-update.md`, `docs/copy-boundary-guide.md`, and `docs/50-state-review-tracker.md`.

Run an individual boundary with `npm run dev:web`, `npm run dev:worker`, or `npm run dev:admin`. The default ports are 3000, 3001, and 3002 respectively.

## Workspace boundaries

- `apps/web`: consumer web boundary.
- `apps/worker`: durable processing boundary placeholder.
- `apps/admin`: administration boundary placeholder.
- `packages/domain`: shared domain contracts.
- `packages/validation`: shared input validation.
- `database/migrations`: version-controlled schema migrations.

The foundation intentionally does not implement product feature logic. Later tickets add account, ingestion, parsing, rules, analysis, reporting, export, and governed narration slices.
