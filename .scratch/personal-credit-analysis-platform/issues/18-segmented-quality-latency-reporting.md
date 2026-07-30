# 18 — Segmented quality and latency reporting

**What to build:** Add a public reporting seam that summarizes pilot-quality evidence by **supported provider**, **document type**, and **jurisdiction**, with latency summaries and core structural counts. This turns ticket 11's "specified, not produced" reporting requirement into executable repo evidence.

**Blocked by:** 11 — Pilot readiness: security, operations, accessibility, and quality gates.

**Status:** done

## Acceptance criteria

- [x] The platform exposes a public reporting seam that returns segmented quality summaries.
- [x] Segments are split by provider, document type, and jurisdiction rather than aggregate-only totals.
- [x] The report includes upload, parse, analysis, finding, matching, parser, and latency summaries.
- [x] The report counts zero-finding analyses correctly rather than only successful/finding-producing runs.
- [x] Tests prove segmentation and latency reporting through the public interface.
- [x] Existing web-boundary tests remain green after the new reporting support lands.

## Result

Implemented `CreditAnalysisPlatform.getQualityReport()` in `packages/platform/src/index.ts`.

The new report now provides, per segment:
- `provider`
- `documentType` (`html` / `pdf`)
- `jurisdiction`
- upload and parsed-report counts
- analysis counts
- finding totals, average findings per analysis, severity counts, classification counts
- matching counts (proposed, confirmed, high-confidence, split)
- parser counts (reports with tradelines, average tradelines per report)
- latency summaries for `uploadToParse` and `parseToAnalysis`

Supporting work:
- Added lightweight internal timestamp tracking for upload/parse/analysis milestones.
- Added `tests/quality-reporting.test.ts` to prove segmentation and zero-finding behavior.
- Increased the web-server test health wait budget to reduce startup flake during full-suite runs.

## Verification

- `npm test -- tests/quality-reporting.test.ts`
- `npm test -- tests/web-server.test.ts`
- `npm test`
- `npm run typecheck`

## Notes

- This is intentionally a **structural reporting seam**, not a final dashboard or analytics product.
- The implementation stays inside the in-memory prototype boundary and avoids introducing external observability vendors.
- This closes the repo gap for **segmented quality/latency reporting**, but does **not** yet produce the remaining pilot-readiness evidence called out in ticket 11 (parser precision/recall, citation validity, narration safety, accessibility, comprehension, drill execution, and human approvals).
