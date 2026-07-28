# Privacy review packet (draft)

> **Status:** Working packet for privacy counsel / privacy owner review, not legal advice. This packet is intended to help answer whether the current pilot notice, retention, rights, and processor disclosures are adequate for the free invite-only pilot.

## Purpose

The product is intentionally limited to a consumer-uploaded, consumer-only, educational flow. This packet collects the privacy-specific evidence needed to decide whether the draft notice and operational controls are acceptable as written, or what must change before launch.

## What is already enforced in code or documented in the repo

- Consumer-uploaded reports only (no self-fetching).
- Consumer-only delivery.
- Written authorization before processing.
- Disclosed retention policy and consumer deletion control.
- No sale, no advertising, no unrelated model training on report data.
- No third-party delivery path to lenders, landlords, employers, insurers, brokers, attorneys, or credit-repair businesses.
- Inbound redaction before analysis for sensitive identifiers.
- Outbound output guard for consumer-visible exports / narration.
- Draft data-flow and processor categories are documented.

## Read this packet together with

1. `docs/privacy-notice-draft.md`
2. `docs/data-flow.md`
3. `docs/glba-wisp-skeleton.md`
4. `docs/risk-assessment-template.md`
5. `docs/pilot-approval-review-packet.md`
6. `docs/pilot-readiness.md`
7. `docs/adr/0003-conditional-free-pilot.md`
8. `docs/adr/0004-glba-safeguards-as-applicable.md`
9. `.scratch/personal-credit-analysis-platform/issues/12-pilot-legal-conditions.md`

## Privacy review questions

### 1) Notice at collection / transparency
- Does `docs/privacy-notice-draft.md` accurately describe the categories of information we collect?
- Does it correctly explain the purposes for collection and use?
- Is the current notice-at-collection framing acceptable, or does it need a different structure or separate notice?
- Are any disclosures missing for the free pilot's actual data flow?

### 2) Retention and deletion
- Are the current retention disclosures specific enough for the pilot?
- Is the consumer deletion control described accurately?
- Do the draft statements about delayed processors / backups need tightening?
- Are there any category-specific retention periods privacy wants finalized before approval?

### 3) Rights handling
- Does the draft correctly frame access / correction / deletion rights for the intended pilot jurisdiction(s)?
- Is the description of consumer corrections in the workspace accurate enough?
- Are any opt-out or correction statements missing or overstated?

### 4) Processor / sharing disclosures
- Are the processor categories in `docs/data-flow.md` and the draft notice aligned?
- Are we accurately saying we do **not** sell/share/use report data for advertising or model training?
- Do any contemplated processors need specific naming or omission in the notice?

### 5) Sensitive information handling
- Are we treating consumer reports as appropriately sensitive for the pilot context?
- Do we need a separate notice / consent for any particularly sensitive categories?
- Is the redaction + output-guard story described honestly in the privacy notice?

### 6) Children / eligibility
- Is the adult-only pilot boundary clearly described?
- Does the current language adequately limit eligibility to adult U.S. consumers?

## Evidence references for approval records

Use one of these stable anchors if the privacy owner approves, requests edits, or blocks launch:
- `docs/privacy-review-packet.md#1-notice-at-collection--transparency`
- `docs/privacy-review-packet.md#2-retention-and-deletion`
- `docs/privacy-review-packet.md#3-rights-handling`
- `docs/privacy-review-packet.md#4-processor--sharing-disclosures`
- `docs/privacy-review-packet.md#5-sensitive-information-handling`
- `docs/privacy-review-packet.md#6-children--eligibility`

## Suggested reviewer responses

Privacy counsel / privacy owner can respond with one of:
- **approved for free pilot**
- **approved with required edits**
- **blocked**

If edits are required, please specify:
- exact notice language to change,
- whether the change is a pilot blocker or a later paid-launch blocker,
- whether a separate security / vendor / legal review is also required.

## Open items the privacy review should resolve

- whether the pilot notice needs a dedicated notice-at-collection format,
- whether the retention periods need to be more specific,
- whether the processor categories should be narrowed or named,
- whether rights language needs to be split by jurisdiction,
- whether the draft should explicitly mention no sale/share/ad/training in the notice itself.

## What this packet does **not** do

This packet does not:
- finalize legal language,
- satisfy security controls,
- approve vendors,
- approve production deployment,
- replace counsel review.

It exists to make the privacy review actionable and evidence-linked.
