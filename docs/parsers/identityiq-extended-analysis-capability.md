# IdentityIQ extended-analysis field capability contract

Status: proposed

This contract is the prerequisite for consumer-facing extended analysis. It is based on four local IdentityIQ PDF samples (2020–2025), inspected only through the repository trust boundary. It contains no consumer values.

## Scope and boundary

The parser may publish only values whose rendered PDF layout has a stable label and whose value can be tied to an exact page/row/bureau source locator. Missing, partial, malformed, or ambiguous content must be represented as unavailable; it must not be inferred from totals, risk-factor text, or other report sections.

No parser output under this contract is a credit recommendation, score prediction, legal conclusion, dispute instruction, or claim that a report is complete.

## Scores — candidate: eligible for implementation

### Verified source structure

Each inspected sample contains a `Credit Score` section with:

1. a three-bureau header row (`TransUnion`, `Experian`, `Equifax`) at distinct horizontal positions;
2. a `Credit Score:` row directly following that header; and
3. a `Score Scale:` row in the same section.

### Extraction contract

- Parse scores only where the enclosing section anchor, all three distinct bureau headers, and the labeled `Credit Score:` row are present on the same page.
- Assign score tokens to the nearest detected bureau column.
- Accept a score only when it is an integer and the same bureau's `Score Scale:` value parses as an inclusive `min-max` range containing it.
- Preserve the score and score-scale rows as separate provenance-bearing parser values. Do not publish lender rank or risk factors in this slice.
- A missing bureau score, missing scale, malformed scale, out-of-range number, duplicate bureau token, or cross-page layout is unavailable for that bureau.
- Consumer display must call this a **reported credit score** and name the source bureau. It must not interpret, rank, compare, forecast, or advise based on the score.

### Required tests

- Synthetic positional fixture covering three valid values, their distinct locators, a missing/malformed scale, and an out-of-range score.
- Local real-sample structure test: when sample PDFs are available, assert each emitted score has an `pdf:p…` locator, one of the three bureaus, and a value inside its captured scale. Do not print values.

## Inquiries — candidate: eligible for implementation

### Verified source structure

Each inspected sample contains an `Inquiries` section with a `Creditor Name / Type of Business / Date of inquiry / Credit Bureau` header. Entries are rendered as one row per inquiry. The section may span pages.

### Extraction contract

- Begin only after an `Inquiries` section anchor and its complete table header are observed.
- Parse an entry only if its row contains: a nonempty creditor name in the left column, a valid displayed date, and exactly one recognized bureau token in the right column.
- Preserve creditor, type of business, and date as separate provenance-bearing values when present. The type value is optional and must be unavailable rather than inferred from column position.
- End parsing at a new recognized major section or a repeated/invalid table header. Never consume creditor-contact entries or public-record rows.
- Deduplicate only byte-identical values that share the same page/row/source locator; otherwise preserve source rows independently.
- Consumer display must state that entries are report-provided inquiries and show only the captured fields/source reference. It must not label them hard/soft, judge their effect, or make a score-impact claim.

### Required tests

- Synthetic positional fixture covering valid rows, missing date, unknown bureau, section boundary, and cross-page continuation.
- Local real-sample structure test: when sample PDFs are available, assert each emitted entry contains one known bureau, a locator, and an ISO-normalized date backed by a displayed date.

## Utilization — deferred

Individual balance and credit-limit values exist at the account level, but the inspected reports do not provide a safe, consistently identifiable aggregate utilization input or report-provided utilization percentage. A derived ratio would require a separately reviewed definition of eligible accounts, treatment of high credit versus limit, denominator state, and aggregation semantics. Do not compute or display utilization under this contract.

## Derogatory summaries — deferred

The report contains individual status, payment-history, remark, special-comment, and collection-related content, but there is no reviewed classification model that can safely turn it into a consumer-level derogatory summary. Do not publish categories, totals, or labels beyond source-linked individual account fields and existing governed findings.

## Education requirements

Any new section primer must be published through the reviewed governance catalog and must clearly state the display's limits. Score copy may describe that a reported score is captured from the source report and may vary by model/provider; inquiry copy may describe it as a report-provided record. Neither may predict score changes or recommend actions.
