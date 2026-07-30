# 22 — Comprehension evidence reporting

**What to build:** Add a public comprehension-evidence seam that summarizes whether the web pilot copy covers the core educational boundary language the repo already uses. This turns comprehension from prose-only copy review into reusable evidence.

**Blocked by:** 11 — Pilot readiness: security, operations, accessibility, and quality gates.

**Status:** done

## Acceptance criteria

- [x] The web layer exposes a read-only comprehension evidence function.
- [x] The report distinguishes pass/fail checks and records missing items.
- [x] The report covers plain-language boundaries, state-selection help, educational limitations, explanation-oriented copy, and no-score / no-dispute promises.
- [x] Tests prove the report on passing and failing checklists.
- [x] Existing web and full-suite tests remain green after the seam lands.

## Result

Implemented `evaluateComprehensionEvidence()` in `apps/web/src/comprehension-report.ts`.

The report returns:
- `passed` boolean
- missing checks
- coverage counts for total / passed / failed checks

Supporting work:
- Added `tests/comprehension-evidence.test.ts`.
- Aligned the report to the actual educational/comprehension copy surface in the web client and docs.

## Verification

- `npm test -- tests/comprehension-evidence.test.ts`
- `npm test`
- `npm run typecheck`

## Notes

- This is intentionally a lightweight evidence report, not a full user-testing program.
- It gives ticket 11 a reusable artifact for comprehension evidence instead of prose-only claims.
