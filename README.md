# Personal Credit Analysis & Education Platform

Foundation workspace for the invite-only, evidence-first product described in the project spec.

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

`npm run health` starts the web, worker, and administration boundaries on temporary local ports and verifies their health responses. It also reports the latest migration version. `npm run verify:pilot` runs the complete automated pilot gate. These commands do not claim production deployment, legal, vendor, accessibility-certification, or security guarantees; the human gates are documented in `docs/pilot-readiness.md`.

Run an individual boundary with `npm run dev:web`, `npm run dev:worker`, or `npm run dev:admin`. The default ports are 3000, 3001, and 3002 respectively.

## Workspace boundaries

- `apps/web`: consumer web boundary.
- `apps/worker`: durable processing boundary placeholder.
- `apps/admin`: administration boundary placeholder.
- `packages/domain`: shared domain contracts.
- `packages/validation`: shared input validation.
- `database/migrations`: version-controlled schema migrations.

The foundation intentionally does not implement product feature logic. Later tickets add account, ingestion, parsing, rules, analysis, reporting, export, and governed narration slices.
