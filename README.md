# Golden Audit

This repository implements a U.S.-only educational credit-report analysis platform with a narrowly scoped invite-only pilot posture.

## What is implemented
- consumer registration, consent, and written authorization
- upload ingestion and parser routing
- deterministic analysis and report generation
- collision-group review for ambiguous matches
- browser-facing pilot app at `/app`
- local runtime persistence via SQLite-backed runtime state
- automated smoke checks, typecheck, and tests

## What is *not* claimed
- no nationwide clearance claim
- no legal, privacy, security, or vendor approval claim
- no production deployment claim
- no promise of score improvement or dispute automation

## Recommended local commands
```sh
npm run typecheck
npm test
npm run build:web
npm run health
```

See `docs/runtime-architecture.md`, `docs/ops-runbook.md`, and `docs/release-gates.md` for the current production-shaped scaffolding.
