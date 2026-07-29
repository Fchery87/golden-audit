# Release Gates

This document defines the minimum checks before a pilot release candidate can be reviewed.

## Automated gates
- `npm run typecheck`
- `npm test`
- `npm run build:web`
- `npm run health`
- `npm run verify:release`

## Browser smoke gates
- App shell loads at `/app`
- State gate renders approved and blocked paths
- Consumer flow can complete a happy path
- Collision-review path can resolve a split subgroup and continue
- No console errors in the browser smoke run

## Runtime monitoring
- Web-boundary transitions and failures are persisted to the runtime SQLite store.
- Persistence failures are recorded separately from request failures.
- Runtime events are scaffolding for later dashboards/alerts, not a finished observability system.

## Release notes
- Do not ship if any gate fails.
- Do not treat passing gates as legal, privacy, security, or rollout approval.
- Human approvals remain required.
