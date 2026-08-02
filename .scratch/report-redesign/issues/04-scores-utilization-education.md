# 04 — Scores, utilization, and extended education

Type: task
Status: resolved

Add score, utilization, derogatory summaries, and related education only after parser coverage, provenance, and safe display contracts exist.

Blocked by: 01, 02

## Evidence assessment — 2026-03-09

The foundation and account-analysis dependencies are complete, but the requested extended-analysis categories are not yet eligible for consumer presentation.

- **Scores:** blocked. The production `ParserReport` and IdentityIQ PDF adapter do not model or emit scores; canonical PDF mapping emits `scores: []`. Existing score values are synthetic-fixture-only.
- **Inquiries:** blocked. The production adapter does not model or emit inquiries; canonical PDF mapping emits `inquiries: []`. Existing inquiry values are synthetic-fixture-only.
- **Utilization:** blocked. The parser can emit individual balance and credit-limit values, but there is no reviewed calculation/display contract or aggregate provenance model.
- **Derogatory summary:** blocked. Individual account-level status, past-due, payment-history, remark, and special-comment fields exist, but no safe categorical classification or summary contract exists.
- **Expanded education:** blocked for those categories. Existing education remains governed and correctly states score predictions and inquiry evaluation are unsupported.

No score, inquiry, utilization, chart, or derogatory-summary UI was added. Implementing any would fabricate coverage or overstate an unsupported analysis.

## Next required work

Create an evidence-first parser-capability ticket before reopening this work. It must define each candidate field’s IdentityIQ source anchors, normalization rules, `ParserValue` provenance/confidence behavior, fixture and real-sample coverage tests, canonical/snapshot contract, and reviewed educational copy. Only categories that pass that contract may be presented.

Blocked by: 05

## Answer

Implemented the eligible extended-analysis scope after the parser capability contract was established.

- Added provenance-backed reported-score rows with captured score scales.
- Added provenance-backed report-provided inquiry rows.
- Rendered these immutable snapshots in browser, print, and export views with explicit no-interpretation/no-effect boundaries.
- Utilization, charts, and derogatory summaries remain deferred because their contracts are still absent.

Validation: `npm run typecheck`, `npm run build:web`, focused tests, full `npm test` (99/99), and `git diff --check` passed.
