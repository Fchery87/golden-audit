# 23 — Pilot drill recording

**What to build:** Add a public drill-recording seam so pilot exercises can be captured as explicit evidence with the fields already required by `docs/pilot-readiness.md`.

**Blocked by:** 11 — Pilot readiness: security, operations, accessibility, and quality gates.

**Status:** done

## Acceptance criteria

- [x] The platform exposes a read-only drill-recording seam.
- [x] Drill records capture date, owner, result, gaps, and follow-up ticket.
- [x] Drill records can be listed back in insertion order.
- [x] Tests prove recording and retrieval behavior.
- [x] Existing suite remains green after the seam lands.

## Result

Implemented pilot drill recording in `packages/platform/src/index.ts`:
- `recordPilotDrill()`
- `getPilotDrills()`
- `PilotDrill` / `PilotDrillResult` types
- snapshot import/export support for persisted drill evidence

Supporting work:
- Added `tests/pilot-drills.test.ts`.
- Wired drill records into exported/imported platform snapshots so runtime evidence can persist with the rest of the pilot state.

## Verification

- `npm test -- tests/pilot-drills.test.ts`
- `npm test`
- `npm run typecheck`

## Notes

- This is an evidence-recording primitive, not an orchestration engine for executing drills.
- It closes the repo gap between "exercises must record date, owner, result, gaps, and follow-up ticket" and an actual machine-readable place to store those records.
