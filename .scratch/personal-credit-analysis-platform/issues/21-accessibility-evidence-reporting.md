# 21 — Accessibility evidence reporting

**What to build:** Add a public accessibility-evidence seam that summarizes the web pilot surface against the repo's current WCAG-oriented checks. This turns accessibility from descriptive documentation into reusable evidence.

**Blocked by:** 11 — Pilot readiness: security, operations, accessibility, and quality gates.

**Status:** done

## Acceptance criteria

- [x] The web layer exposes a read-only accessibility evidence function.
- [x] The report distinguishes pass/fail checks and records missing items.
- [x] The report covers skip link, aria-live status, focus-visible styling, labeled inputs, reduced-motion respect, readable export, and keyboard paths.
- [x] Tests prove the report on passing and failing checklists.
- [x] Existing accessibility-related UI tests and the full suite remain green after the seam lands.

## Result

Implemented `evaluateAccessibilityEvidence()` in `apps/web/src/accessibility-report.ts`.

The report returns:
- `passed` boolean
- missing checks
- coverage counts for total / passed / failed checks

Supporting work:
- Added `tests/accessibility-evidence.test.ts`.
- Kept the report aligned to the actual web surface evidence the repo already tracks.

## Verification

- `npm test -- tests/accessibility-evidence.test.ts`
- `npm test`
- `npm run typecheck`

## Notes

- This is a lightweight evidence report, not a full axe/lighthouse replacement.
- It gives the pilot-readiness lane a reusable artifact for current UI evidence instead of prose-only claims.
