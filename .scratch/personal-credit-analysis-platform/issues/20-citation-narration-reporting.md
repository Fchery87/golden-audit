# 20 — Citation validity and narration-safety reporting

**What to build:** Add a public narration-evaluation seam that reports whether consumer-facing narration is grounded in the structured findings and whether it stays inside the output guard. This turns narration safety from a binary pass/fail check into reusable evidence.

**Blocked by:** 11 — Pilot readiness: security, operations, accessibility, and quality gates.

**Status:** done

## Acceptance criteria

- [x] The output-guard package exposes a read-only narration-evaluation function.
- [x] The report distinguishes safety violations from grounded citation coverage.
- [x] The report counts coverage of finding titles and attached limitations.
- [x] Tests prove the report on safe and unsafe narration examples.
- [x] Existing output-guard, parser, platform, and web tests remain green after the seam lands.

## Result

Implemented `evaluateNarrationOutput()` in `packages/output-guard/src/index.ts`.

The new evaluator returns:
- `safe` boolean
- violation list
- citation coverage summary for findings and limitations

Supporting work:
- Added `tests/narration-evaluation.test.ts` to exercise the seam.
- Kept `assertSafeConsumerOutput()` unchanged as the fail-closed boundary guard.

## Verification

- `npm test -- tests/narration-evaluation.test.ts tests/output-guard.test.ts`
- `npm test`
- `npm run typecheck`

## Notes

- This is intentionally a lightweight reporting primitive, not a model-eval dashboard.
- It complements the deterministic narration fallback by making groundedness measurable.
