# 25 — Pilot evidence bundle reporting

**What to build:** Add a public pilot evidence bundle that composes existing reviewer-facing evidence seams into a single read-only summary artifact.

**Blocked by:** 11 — Pilot readiness: security, operations, accessibility, and quality gates.

**Status:** done

## Acceptance criteria

- [x] The platform exposes a read-only combined pilot evidence bundle.
- [x] The bundle includes pilot gate state, quality reporting, and drill evidence.
- [x] The bundle accepts caller-supplied comprehension and accessibility evidence.
- [x] The bundle optionally includes narration evidence.
- [x] The bundle summarizes open approval areas and failing evidence surfaces.
- [x] Tests prove both fully-composed and incomplete-review scenarios.
- [x] Existing suite remains green after the seam lands.

## Result

Implemented `getPilotEvidenceBundle()` in `packages/platform/src/index.ts`.

The bundle returns:
- `generatedAt`
- `pilotGate`
- `quality`
- `drills`
- `comprehension`
- `accessibility`
- optional `narration`
- `summary` with open approval areas and failing evidence surfaces

Supporting work:
- Added `tests/pilot-evidence-bundle.test.ts`.
- Reused the existing quality, drill, comprehension, accessibility, and narration evidence shapes instead of inventing a new parallel schema.

## Verification

- `npm test -- tests/pilot-evidence-bundle.test.ts`
- `npm test`
- `npm run typecheck`

## Notes

- This is a composition/reporting seam only; it does not execute drills, grant approvals, or certify launch.
- It is intended to make accountable review easier by packaging existing evidence surfaces together without changing their source responsibilities.
