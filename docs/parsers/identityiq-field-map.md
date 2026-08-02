# IdentityIQ report field map (adapter target schema)

> **Redacted.** This document contains **only field labels and layout structure** derived from a real IdentityIQ tri-bureau export. It contains **no values** (no names, account numbers, balances, or dates). The source files live in `docs/reports/` and are gitignored — never committed, processed locally only under the trust-boundary controls in ticket 12.

**Provider:** IdentityIQ (tri-bureau aggregator — renders TransUnion, Experian, and Equifax sections).
**Lead provider for the pilot** (per product decision): IdentityIQ, **PDF-only** ingestion.
**Sample basis:** four IdentityIQ PDF reports (2020–2025). The saved HTML files are template shells and are not an ingestion format. ⚠️ Layout coverage remains finite; parser changes must retain the four-sample smoke gate.

## Why PDF is the ingestion format
- **PDF:** fully rendered native text; reliable data, but the three bureaus are laid out in **side-by-side columns**, so field extraction must be **coordinate-aware** (column x-positions), not line-regex. The current `unpdf`/pdfjs path supplies word bounding boxes and is validated across the four local PDF samples.
- **Saved HTML:** an AngularJS template shell without embedded per-account values. Executing report-embedded code to render it is not an acceptable ingestion path, so no HTML adapter is supported.

## Top-level report structure (PDF)
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
Each parsed tradeline maps to `ParserTradeline` (creditor, maskedAccount, balance/status/opened/updated, date of first delinquency, payment-history cells, remarks, and special comment codes as provenance-bearing `ParserValue<T>` values). Payment cells are admitted only when the PDF display carries an explicit `YYYY-MM:<status>` month key; text without an explicit key is unavailable rather than positioned or inferred. Bureaus stay separate (`bureau: 'transunion'|'experian'|'equifax'`) — never destructively merged (CONTEXT.md / spec). Unparseable or absent scalar values → `normalized: null`, `state: 'unknown'`; absent repeated values → an empty list and unavailable coverage (never invented).

## Slice 2 interpretation and boundary
- **DOFD:** the adapter recognizes only the explicit `Date of First Delinquency` label and preserves the displayed value plus source location. It does not emit a Finding from the value.
- **Payment history:** the adapter accepts an explicitly date-keyed status sequence, retaining each month/status cell independently. It does not infer a header, month order, missing cells, or a 24-month grid from unkeyed positional text.
- **Remarks and special comment codes:** the adapter recognizes the separate `Remarks` and `Special Comment Code(s)` labels and records their displayed text/code separately for each bureau. It never derives a special code from free-text remarks.
- **No re-aging conclusion:** movement requires reliably matched account identity across separately dated reports. This one-report parser and analysis model do not make that comparison, so no re-aging or DOFD Finding is published in this slice.

## Personal Information section (added 2026-08-02)

Maps to `ParserPersonalInformation` (names, also-known-as, dates of birth, SSN fragments, current
and previous addresses, employers) with per-bureau provenance. Three layout facts were established
against all four authorized samples, each after a plausible-looking implementation failed on them:

- **The label is vertically centered against its value block**, so it is the *middle* row, not the
  first. Continuation rows attach to the nearest label that accepts continuations; single-line
  fields (Name, Date of Birth, SSN) accept none, which is what stops an address's first line from
  attaching to the date above it.
- **Label and value separate by x-center, not by a left-edge cut.** TransUnion values begin around
  x≈202 while labels end around x≈157, and several value words start left of any fixed `xMin`
  boundary — an `xMin`-based split silently merges the first bureau's value into the label text.
- **Addresses wrap over three or four rows with no delimiter**, so each bureau column's tokens are
  segmented at ZIP boundaries. A segment not terminated by a ZIP is discarded rather than emitted
  as a partial address, and reported-on dates interleaved between addresses are dropped so they
  cannot prefix the next one.

**Current vs previous comes from the bureau's own ordering** (first address = current), because the
`Previous Address(es)` label is centered and therefore sits *below* rows that already belong to it —
a label-position split assigns them to the wrong field.

**Dates of birth keep the precision the report states.** Bureaus commonly disagree on precision for
the same consumer (one gives `1/9/1986`, another `1986`). Padding the year-only value to a full date
would invent a month and day the document never claimed and then report the invention as a
discrepancy, so comparison is prefix-based at the stated precision.

**SSN:** only a four-digit fragment from an already-masked display is retained. A display carrying
more than four digits is recorded as unreadable rather than trimmed — the inbound redaction boundary
owns that case, and trimming here would hide its failure. Employer values must contain letters, so a
trailing ZIP row from the address block above cannot be published as an employment record.


## Label/value boundary (revised 2026-08-02)

**The boundary between a row's label and its per-bureau values is derived from the detected columns,
not from a fixed x.** The bureau columns move between templates — TransUnion's x-centre is ≈241 in
one authorized sample and ≈308 in another — so a fixed cut lands on the wrong side of the label in
both directions:

- **Too far right:** every label word is nearest to the first column and is bucketed into it. The
  TransUnion cell for an account then reads `Account Type: Revolving` while Experian and Equifax
  read `Revolving`. Measured before the fix: **100% of TransUnion tradelines carried their own label
  as the value**, so every cross-bureau string comparison compared a label against a bare value.
- **Too far left:** the joined label no longer matches its field pattern and the whole account block
  goes undetected.

The boundary is `min(detected column x) - 60`, the same rule the Personal Information reader already
used. When no bureau header row is found (synthetic fixtures, unknown templates) there is nothing to
derive it from, so the legacy fixed cut is retained rather than guessed at.

## Fallback structural-row guard (revised 2026-08-02)

The balance-row fallback exists only for older layouts missing account-block balance coverage.
Account-block parsing remains the sole source of `updated` values.

Two rules gate it, both structural facts about this format rather than a list of known label names:

1. **A row whose label cell ends in a colon is not an account.** Every field label in this format
   ends in a colon; a creditor name does not. This replaces an allowlist of known labels, which is
   what let the Summary section's own tallies through.
2. **A bare integer is not a currency amount.** The fallback requires an explicit `$`. Masked
   account numbers, term counts, the payment-history `Year` header, and every Summary tally are
   bare integers rendered per bureau, and all of them parsed as money.

Measured on the authorized samples before these rules: one report emitted **33 tradelines of which
28 were fabricated** — 8 × `Year`, 3 × `Account #`, 3 × `Monthly Payment`, 3 × `No. of Months
(Terms)`, plus one each of `Total/Open/Closed Accounts`, `Delinquent`, `Derogatory`, `Collection`,
`Balances`, `Payments`, `Public Records`, `Inquiries`, and `Credit Score`. Those fabricated rows
were also the **only** source of cross-bureau balance differences in the whole corpus; no real
account in these four reports disagrees on balance across bureaus. Covered by synthetic positional
regressions in `tests/parser-identityiq.test.ts`; the four-sample smoke gate still applies.

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
