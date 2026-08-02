# 05 — Extended-analysis parser capability and provenance

Type: task
Status: resolved

## Goal

Establish evidence-backed parser capability contracts for any IdentityIQ extended-analysis category before consumer-facing score, inquiry, utilization, derogatory-summary, chart, or category-specific education work proceeds.

## Scope

For each candidate category, inspect representative IdentityIQ PDF source structure and the existing production parser output. A category is eligible only if it has:

1. a stable source anchor/layout signal;
2. a conservative normalization rule;
3. `ParserValue` provenance, confidence, and unknown-state behavior;
4. synthetic fixture coverage plus non-vacuous real-sample coverage where samples are available;
5. canonical mapping and immutable consumer-report snapshot support; and
6. approved bounded educational wording without legal, dispute, or score-prediction claims.

## Non-goals

- Do not infer a score, inquiry, utilization percentage, or derogatory status from absent or ambiguous data.
- Do not ship a chart or a consumer-facing summary merely because a synthetic fixture can populate it.
- Do not re-open ticket 04 until a category passes the capability contract.

## Candidate categories

- Scores
- Inquiries
- Utilization
- Derogatory summaries

## Acceptance criteria

- Every implemented category has source-locator-backed parser tests and conservative fail-closed behavior.
- Unsupported categories are explicitly documented as deferred with the missing evidence.
- No raw identifiers or fabricated source locations enter consumer reports or exports.

## Comments

Created as the prerequisite identified by ticket 04’s evidence assessment.

## Answer

Implemented and verified conservative IdentityIQ PDF capabilities for **reported scores** and **report-provided inquiry rows**.

- Scores require the section anchor, exactly one tri-bureau header per bureau, a single integer score token per bureau, and a source-backed score scale containing that value.
- Inquiries require the labeled table header, a nonempty creditor, an exact calendar-valid displayed date, and exactly one bureau token in the right-hand bureau column.
- Both categories use parser provenance, canonical mapping, immutable consumer report/export snapshots, and bounded print/in-flow presentation. Missing or unsafe rows are omitted.
- Utilization and derogatory summaries remain deferred: no aggregate/categorical contract was added.
- Validation: `npm run typecheck`, `npm run build:web`, focused parser/platform tests, `npm test` (99/99), and `git diff --check` all passed. Review-found date, bureau-column, duplicate-score, and coverage issues were corrected before final verification.
