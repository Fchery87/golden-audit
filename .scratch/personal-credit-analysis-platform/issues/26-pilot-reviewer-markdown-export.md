# 26 — Pilot reviewer Markdown export

**What to build:** Add a public Markdown export that renders the combined pilot evidence bundle into a reviewer-friendly summary.

**Blocked by:** 11 — Pilot readiness: security, operations, accessibility, and quality gates.

**Status:** done

## Acceptance criteria

- [x] The platform exposes a read-only Markdown reviewer export.
- [x] The export renders pilot gate status and open approval areas.
- [x] The export lists recorded approvals.
- [x] The export summarizes evidence surfaces for comprehension, accessibility, drills, quality, and optional narration.
- [x] The export renders drill follow-ups when gaps remain.
- [x] Tests prove both populated and sparse export behavior.
- [x] Existing suite remains green after the seam lands.

## Result

Implemented `renderPilotReviewerMarkdown()` in `packages/platform/src/index.ts`.

The export includes:
- generated timestamp
- pilot gate readiness
- open approval areas
- failing evidence surfaces
- approvals list
- evidence surface summaries
- drill follow-up section

Supporting work:
- Added `tests/pilot-reviewer-markdown.test.ts`.
- Kept the formatter layered on top of `getPilotEvidenceBundle()` so the Markdown export stays a presentation seam, not a second source of truth.

## Verification

- `npm test -- tests/pilot-reviewer-markdown.test.ts`
- `npm test`
- `npm run typecheck`

## Notes

- This export is reviewer-facing presentation only; it does not alter approvals, drill state, or pilot readiness.
- The export is intentionally compact so it can drop into approval packets or handoff documents with minimal editing.
