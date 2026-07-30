# 19 — Parser evaluation reporting

**What to build:** Add a public parser-evaluation reporting seam that summarizes labeled parser-field observations as precision/recall-style evidence. This turns parser-quality evidence from "present in tests" into an explicit reusable reporting primitive.

**Blocked by:** 11 — Pilot readiness: security, operations, accessibility, and quality gates.

**Status:** done

## Acceptance criteria

- [x] The parser package exposes a read-only parser-evaluation reporting function.
- [x] The report distinguishes matched, missing, and unexpected observations.
- [x] The report returns precision and recall counts derived from labeled observations.
- [x] Tests prove the report on a small labeled HTML fixture.
- [x] Existing parser, platform, and web tests remain green after the seam lands.

## Result

Implemented `evaluateParserFields()` in `packages/parser/src/index.ts`.

The new evaluator returns:
- total observations
- matched count
- missing count
- unexpected count
- precision
- recall
- per-label outcomes

Supporting work:
- Added `tests/parser-evaluation.test.ts` to exercise the seam.
- Kept the new interface read-only and package-local so it stays aligned with parser-quality evidence rather than host-app policy.

## Verification

- `npm test -- tests/parser-evaluation.test.ts`
- `npm test`
- `npm run typecheck`

## Notes

- This is intentionally a lightweight evaluation primitive, not a full metrics dashboard.
- It complements the existing parser and IdentityIQ coverage by making field-level labeled observations measurable.
