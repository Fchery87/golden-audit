# 27 — Pilot reviewer JSON export

**What to build:** Add a structured reviewer export that serializes the combined pilot evidence bundle into stable JSON for tooling and archive use.

**Blocked by:** 11 — Pilot readiness: security, operations, accessibility, and quality gates.

**Status:** done

## Acceptance criteria

- [x] The platform exposes a read-only JSON reviewer export.
- [x] The export serializes the bundle with stable reviewer fields.
- [x] The export preserves incomplete-state summaries.
- [x] The export includes the Markdown rendering for convenient human review.
- [x] Tests prove populated and incomplete export behavior.
- [x] Existing suite remains green after the seam lands.

## Result

Implemented `renderPilotReviewerJson()` in `packages/platform/src/index.ts`.

The export serializes:
- the full pilot evidence bundle
- a `markdown` rendering for human readers

Supporting work:
- Added `tests/pilot-reviewer-json.test.ts`.
- Kept the JSON export layered on top of `getPilotEvidenceBundle()` and `renderPilotReviewerMarkdown()` so it stays presentation-only.

## Verification

- `npm test -- tests/pilot-reviewer-json.test.ts`
- `npm test`
- `npm run typecheck`

## Notes

- This is a structured archive / tooling seam, not a new source of truth.
- It gives reviewers a machine-readable artifact without forcing them to reconstruct state from multiple report surfaces.
