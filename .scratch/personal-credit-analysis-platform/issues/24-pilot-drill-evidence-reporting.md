# 24 — Pilot drill evidence reporting

**What to build:** Add a public drill-evidence report that summarizes recorded exercises for accountable reviewers.

**Blocked by:** 11 — Pilot readiness: security, operations, accessibility, and quality gates.

**Status:** done

## Acceptance criteria

- [x] The platform exposes a read-only drill evidence report.
- [x] The report summarizes total drill count and outcomes by status.
- [x] The report includes open gaps from non-passing drills.
- [x] The report deduplicates follow-up ticket references.
- [x] Tests prove both populated and empty report behavior.
- [x] Existing suite remains green after the seam lands.

## Result

Implemented `getPilotDrillEvidenceReport()` in `packages/platform/src/index.ts`.

The report returns:
- `generatedAt`
- `totalDrills`
- `outcomes` grouped by `passed | passed-with-gaps | blocked`
- `openGaps` for drills that still need follow-up
- deduplicated `followUpTickets`

Supporting work:
- Added `tests/pilot-drill-evidence-report.test.ts`.
- Kept the seam read-only and platform-local so it composes cleanly with the existing drill-recording API.

## Verification

- `npm test -- tests/pilot-drill-evidence-report.test.ts`
- `npm test`
- `npm run typecheck`

## Notes

- This is a reviewer-facing summary artifact, not a workflow engine.
- It turns raw drill entries into a compact evidence snapshot that can be cited in pilot approval review.
