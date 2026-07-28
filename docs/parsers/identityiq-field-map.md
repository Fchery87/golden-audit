# IdentityIQ report field map (adapter target schema)

> **Redacted.** This document contains **only field labels and layout structure** derived from a real IdentityIQ tri-bureau export. It contains **no values** (no names, account numbers, balances, or dates). The source files live in `docs/reports/` and are gitignored — never committed, processed locally only under the trust-boundary controls in ticket 12.

**Provider:** IdentityIQ (tri-bureau aggregator — renders TransUnion, Experian, and Equifax sections).
**Lead provider for the pilot** (per product decision): IdentityIQ, supported in **both PDF and HTML**.
**Sample basis:** one IdentityIQ report exported as both PDF (native-text, 8 pp / 13 text pages) and HTML (AngularJS snapshot, ~671 KB). ⚠️ **One sample → overfitting risk.** Pilot use requires ≥2 samples (same provider, different person/date) before the adapter is trusted.

## Why two formats, and how they differ
- **PDF:** fully rendered native text; reliable data, but the three bureaus are laid out in **side-by-side columns**, so field extraction must be **coordinate-aware** (column x-positions), not line-regex. `pdftotext -layout` fragments the columns — confirmed empirically — so the adapter must use a library that yields word bounding boxes (e.g., a coordinate-aware PDF text extractor), not regex over flattened text.
- **HTML:** an AngularJS snapshot — semantic model is rich (bureau `@symbol` codes; named fields such as `@accountNumber`; `Tradeline` partitions) but **template markup is interleaved with interpolated data** (`ng-` directives, residual `{{ }}`). Some values are rendered (present as text), some are not. Cleanest parse target is the **rendered table cells**, ignoring template remnants — or an IdentityIQ data export if one exists.

## Top-level report structure (both formats)
- Report metadata: report date (one per bureau), reference number, generating provider.
- **Personal information:** name, current/prior addresses, employment, aliases / known-as, fraud statements.
- **Account history** (open revolving/installment/mortgage tradelines).
- **Closed accounts.**
- **Collection accounts.**
- **Inquiries** (hard/soft).
- **Public records.**
- Bureau-specific notes / statements.

## Tradeline field map (per account; values repeated for each of the 3 bureaus)
| Field | Notes |
|---|---|
| Creditor name | the tradeline's `Creditor` / subscriber |
| Account number | masked in the display (last 4); full number must be redacted before analysis (ticket 12) |
| Account type / industry code | e.g., revolving, installment, mortgage; `BUREAU CODE` / `ACCOUNT TYPE` |
| Date opened | precision matters (month vs day) — preserve (CONTEXT.md) |
| Date reported / last active | per bureau |
| Account status | open/closed/current/late-marker |
| Recent balance | currency; the comparison field for cross-bureau findings |
| High credit / credit limit | currency |
| Past due | currency |
| Terms / scheduled payment | e.g., months + amount |
| Payment pattern / history | per-bureau status sequence |
| Remarks | per-bureau remark codes/text |
| Responsibility | individual/joint/authorized-user |

## Canonical mapping (to `packages/parser` types)
Each parsed tradeline maps to `ParserTradeline` (creditor, maskedAccount, balance/status/opened/updated as `ParserValue<T>` with **element/page-level provenance**, original display text, calibrated confidence, missing-value state). Bureaus stay separate (`bureau: 'transunion'|'experian'|'equifax'`) — never destructively merged (CONTEXT.md / spec). Unparseable or absent values → `normalized: null`, `state: 'unknown'` (never invented).

## DECISIVE FINDING — IdentityIQ saved HTML is a template shell (no per-account data)

Closer inspection (all 4 HTML samples, 2020–2025) overturned the earlier "HTML-primary" conclusion:
- Per-account values are **AngularJS `{{ }}` template bindings** (e.g. `{{(tradeline['@currentBalance']|currency)||"-"}}`) populated at runtime by `ng-repeat` filtering a `tradelines` array by `Bureau.@symbol` (TUC/EXP/EQF).
- The `tradelines` array is **NOT embedded** in the file: `"@currentBalance":` data-form count = 0; no `tradelines = [...]` assignment. Only ~88–113 rendered currency values exist, and they are **summary-level** (totals/scores), not per-account.
- Therefore the saved HTML **cannot be parsed for per-account tradeline data without executing the embedded AngularJS** to fetch+render — which requires a headless browser AND executes untrusted report-embedded JS (counsel: document JS is untrusted; trust-boundary concern). Not viable for ingestion.

## Ingestion decision: PDF is the format
- **PDF** contains rendered per-account data (balances proven extractable on the real report). → **PDF is the ingestion format** to push users toward.
- **HTML (IdentityIQ saved)** is a template shell → **do not build an HTML adapter**; drop the "either format" goal unless IdentityIQ provides a rendered HTML export (verify with one fresh official "Download This Report").

## Adapter plan (revised, PDF-only)
1. **PDF dynamic per-report column detection** (the real next slice): replace fixed `BUREAU_BANDS` with detection of each report's 3 bureau-header x-centers, then assign each value to its nearest bureau column. Validated against all 4 PDF samples (2020/21/23/25) — the overfitting guard.
2. Multi-line account-block reconstruction (full fields) once columns are detected dynamically.
3. Detector signature for IdentityIQ-PDF; all else flagged unsupported (reject-rather-than-guess).
4. ≥4-sample smoke tests (structure-only) committed as the cross-template overfitting guard.
5. Validation gate: all 4 PDF samples yield 3-bureau tradelines before pilot trust.
3. **Detector:** register IdentityIQ-PDF and IdentityIQ-HTML signatures; everything else flagged unsupported (reject-rather-than-guess).
4. **Tests:** synthetic fixture in the IdentityIQ layout (fictitious values) → adapter → `ParserReport`; plus a **local-only smoke test** on the real files asserting structure only (counts, bureaus) — never printing/committing values.
5. **Validation gate:** ≥2 real samples before pilot trust; field-precision fixtures per ticket 13.
