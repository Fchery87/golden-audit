# Legal review packet (draft)

> **Status:** Working packet for retained California/FCRA counsel, not legal advice. This is the first lane in the human-gate review sequence because legal clearance is the primary blocker on the free invite-only pilot.

## Purpose

This packet bundles the current evidence counsel needs to answer one question:

> **Can the free invite-only pilot proceed with the current consumer-only, educational, report-upload model — and if yes, under what required edits?**

It is intentionally narrow: it does **not** try to finalize privacy, security, or vendor contracts. It points counsel to the exact artifacts and the exact open questions that remain.

## What is already enforced in code

The current prototype already enforces these pilot boundaries:

- **Consumer-uploaded reports only** — no bureau self-fetching.
- **Consumer-only delivery** — no delivery to lenders, landlords, employers, insurers, brokers, attorneys, or credit-repair businesses.
- **Written authorization gate** before any processing.
- **No third-party-delivery API path**.
- **No payment / billing / subscription path** (the pilot is genuinely free).
- **No advertising / no data sale / no training on report data** (disclosed in authorization text).
- **Retention policy disclosed** and consumer deletion control available.
- **Outbound guardrails** block dispute-generation language and legal-conclusion language.
- **IdentityIQ PDF is the current ingestion format**; saved HTML is documented as a template shell, not a live data source.

## Counsel should review these artifacts in this order

1. `docs/adr/0003-conditional-free-pilot.md`
2. `docs/adr/0004-glba-safeguards-as-applicable.md`
3. `docs/legal-pre-mortem-brief.md`
4. `docs/data-flow.md`
5. `docs/privacy-notice-draft.md`
6. `docs/glba-wisp-skeleton.md`
7. `docs/risk-assessment-template.md`
8. `docs/pilot-readiness.md`
9. `.scratch/personal-credit-analysis-platform/issues/12-pilot-legal-conditions.md`
10. `docs/pilot-approval-review-packet.md`

## Counsel questions to answer

### 1) CRA / CRO boundary
- Does the current consumer-uploaded, consumer-only delivery model keep us outside CRA status for the free pilot?
- Does the current language avoid CRO / credit-repair boundaries sufficiently?
- Are any terms, sample findings, or UX copy too close to legal advice or dispute-generation?

### 2) Authorization and notice
- Is the current written authorization sufficiently specific for the free pilot?
- Is the privacy notice draft directionally correct, or does it need a notice-at-collection rewrite?
- Are any disclosures missing for the data-flow we actually have?

### 3) Retention / deletion
- Is the disclosed retention policy acceptable for the free pilot?
- Are the delayed processor / backup statements sufficient, or do we need more precise deletion language?
- Are any retention periods or deletion controls too vague to launch?

### 4) GLBA / safeguards
- Does counsel agree the pilot should be designed as though GLBA applies until cleared?
- Is the WISP skeleton directionally sufficient, or does counsel want a different structure before security implements controls?
- Are the risk assessment and vendor oversight templates enough to support approvals?

### 5) Vendor / processor scope
- Which processor categories are permitted for the pilot?
- What contractual clauses are mandatory (confidentiality, security, deletion, incident notification, subprocessors, data residency)?
- Are any contemplated vendors or features incompatible with the free pilot boundary?

### 6) Scope / launch boundary
- Is the current pilot correctly limited to a **free invite-only educational pilot**?
- What changes are required before any paid launch, if one is ever considered?
- Is California Credit Services Act review required before the pilot or only before a paid model?

## Open legal conditions still tracked in ticket 12

The following are still open and require accountable owner review/sign-off:

- reports encrypted in transit and at rest,
- every processor bound to confidentiality/security/deletion/incident duties,
- WISP with a designated responsible individual,
- documented risk assessment,
- MFA and least privilege,
- vendor due diligence,
- incident-response plan,
- final written counsel clearance,
- formal GLBA classification,
- CCSA registration / bonding / contract obligations review.

## Suggested counsel response formats

Counsel can answer each major question in one of three ways:

- **Approved for free invite-only pilot**
- **Approved with required edits**
- **Blocked — do not launch yet**

If edits are required, counsel should state:
- exact wording to change,
- exact artifacts affected,
- whether the change is a pilot blocker or a later paid-launch blocker.

## Evidence references for approval records

When counsel signs off (or requests changes), record the evidence reference using one of these stable anchors:

- `docs/legal-review-packet.md#1-cra--cro-boundary`
- `docs/legal-review-packet.md#2-authorization-and-notice`
- `docs/legal-review-packet.md#3-retention--deletion`
- `docs/legal-review-packet.md#4-glba--safeguards`
- `docs/legal-review-packet.md#5-vendor--processor-scope`
- `docs/legal-review-packet.md#6-scope--launch-boundary`

## Final note

This packet is intentionally conservative. It is meant to help counsel decide whether the current free pilot boundary is acceptable **as written**, not to argue for a launch that the product cannot yet support.
