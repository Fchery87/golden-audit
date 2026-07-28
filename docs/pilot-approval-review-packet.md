# Pilot approval review packet (draft)

> **Status:** Working packet for accountable reviewers, not legal advice. This packet does not grant approval by itself; it bundles the current evidence and unresolved questions so counsel, privacy, security, operations, accessibility, product, and vendor owners can review the pilot coherently.

## Purpose

The application is fail-closed until these seven approval areas are recorded:
- `product`
- `legal`
- `privacy`
- `security`
- `operations`
- `accessibility`
- `vendor`

This packet exists to:
1. point each reviewer at the relevant artifacts,
2. make the remaining open questions explicit,
3. provide stable evidence references that can be cited in `docs/pilot-approval-records.json`, and
4. keep the review process stack-agnostic until implementation choices are actually made.

## Packet contents

| Artifact | Purpose | Primary reviewers |
|---|---|---|
| `docs/data-flow.md` | Logical end-to-end data path, storage points, deletion model, processor categories | legal, privacy, security, vendor |
| `docs/glba-wisp-skeleton.md` | Draft WISP / safeguards structure | security, legal |
| `docs/privacy-review-packet.md` | Privacy-owner review packet | privacy |
| `docs/risk-assessment-template.md` | Seeded risk register and scoring rubric | security, operations |
| `docs/legal-review-packet.md` | Counsel-first legal handoff packet | legal |
| `docs/privacy-review-packet.md` | Privacy-owner review packet | privacy |
| `docs/security-review-packet.md` | Security-owner review packet | security |
| `docs/approval-handoff-template.md` | Fill-in template for sending review packets and collecting approval responses | all reviewers |
| `docs/legal-approval-handoff.md` | Ready-to-send legal approval request | legal |
| `docs/privacy-approval-handoff.md` | Ready-to-send privacy approval request | privacy |
| `docs/security-approval-handoff.md` | Ready-to-send security approval request | security |
| `.scratch/personal-credit-analysis-platform/issues/12-pilot-legal-conditions.md` | Traceable list of counsel-derived conditions | legal, privacy, security |
| `.scratch/personal-credit-analysis-platform/issues/11-pilot-readiness.md` | Traceable list of operational/human gates | product, operations, accessibility |

## What this packet can and cannot do

### This packet can do
- give reviewers a current, consistent picture of the pilot,
- surface contradictions or missing information early,
- create evidence references for approval records,
- reduce back-and-forth by putting data flow, privacy, security, and legal artifacts in one place.

### This packet cannot do
- replace retained counsel,
- finalize a privacy notice or WISP,
- satisfy encryption / MFA / vendor-contract obligations on paper alone,
- approve a production launch without accountable owner sign-off.

## Review lanes

## 1. Legal review lane

### Reviewer goal
Decide whether the **free invite-only pilot** stays inside the intended product boundary and whether the current drafts are safe enough to approve (or narrow) for that pilot.

### Read in this order
1. `docs/adr/0003-conditional-free-pilot.md`
2. `docs/adr/0004-glba-safeguards-as-applicable.md`
3. `docs/legal-pre-mortem-brief.md`
4. `docs/data-flow.md`
5. `docs/privacy-notice-draft.md`
6. `.scratch/personal-credit-analysis-platform/issues/12-pilot-legal-conditions.md`

### Legal review questions
- Does the current delivery model remain consumer-only and outside the CRA/CROA lines we are trying to avoid?
- Is the **authorization** language sufficient for the free pilot?
- Is the **privacy notice draft** directionally correct for the pilot, and what must change before approval?
- Does the **data-flow diagram** accurately describe the processor and deletion story counsel needs to review?
- Are any sample findings / terms / retention statements still too aggressive or too vague?
- Is any additional state-specific notice or paid-model review required before proceeding further?

### Evidence reference to use when recording approval
- `docs/pilot-approval-review-packet.md#1-legal-review-lane`

## 2. Privacy review lane

### Reviewer goal
Decide whether the current collection / use / retention / rights disclosures are directionally correct and what additional notices or workflows are required before pilot use.

### Read in this order
1. `docs/privacy-notice-draft.md`
2. `docs/data-flow.md`
3. `.scratch/personal-credit-analysis-platform/issues/12-pilot-legal-conditions.md`
4. `docs/pilot-readiness.md`

### Privacy review questions
- Do the categories collected and purposes accurately match the actual product behavior?
- Is the notice-at-collection framing adequate for the pilot, or is a different format required?
- Are retention / deletion disclosures specific enough, and what must be finalized before launch?
- Are rights workflows (access / correction / deletion) described correctly for the intended jurisdictions?
- Are processor categories described consistently with the data-flow diagram?

### Evidence reference to use when recording approval
- `docs/pilot-approval-review-packet.md#2-privacy-review-lane`

## 3. Security review lane

### Reviewer goal
Decide whether the draft safeguards and seeded risk register are sufficient to guide implementation, and identify what infrastructure decisions or evidence are still required before real pilot use.

### Read in this order
1. `docs/data-flow.md`
2. `docs/glba-wisp-skeleton.md`
3. `docs/risk-assessment-template.md`
4. `docs/pilot-readiness.md`
5. `.scratch/personal-credit-analysis-platform/issues/12-pilot-legal-conditions.md`

### Security review questions
- Does the data-flow document correctly identify all places customer information enters, is processed, is stored, and is deleted?
- Are the WISP sections sufficient, and what mandatory sections are still missing?
- Which risks in the template are highest priority for the actual deployment architecture?
- What encryption, KMS, IAM, MFA, logging, vendor, and incident-response decisions are required before the pilot can be approved?
- What evidence must exist (screenshots, configs, policies, contracts) for the final security sign-off?

### Evidence reference to use when recording approval
- `docs/pilot-approval-review-packet.md#3-security-review-lane`

## 4. Vendor review lane

### Reviewer goal
Decide which third parties are permitted to touch customer information and what diligence / contractual evidence is required for each.

### Read in this order
1. `docs/data-flow.md#external-parties--processor-categories`
2. `docs/glba-wisp-skeleton.md#8-vendor-oversight`
3. `docs/risk-assessment-template.md`

### Vendor review questions
- Which processor categories are unavoidable for the pilot?
- Which categories can be deferred or eliminated?
- What contract / DPA / security questionnaire evidence is required for each vendor class?
- What incident-notification, deletion, and subprocessor terms are mandatory?
- Are any contemplated vendors incompatible with the free pilot's constraints?

### Evidence reference to use when recording approval
- `docs/pilot-approval-review-packet.md#4-vendor-review-lane`

## 5. Product review lane

### Reviewer goal
Decide whether the product boundary, educational framing, and launch scope remain aligned with the pilot's legal and trust constraints.

### Read in this order
1. `docs/pilot-readiness.md`
2. `.scratch/personal-credit-analysis-platform/issues/12-pilot-legal-conditions.md`
3. `docs/data-flow.md`

### Product review questions
- Is the current pilot scope still invite-only, free, consumer-only, and educational?
- Are any planned features crossing into dispute-generation, underwriting, or legal-advice territory?
- Do the current finding/down-ranking/matching decisions still support the intended consumer experience?
- What should be explicitly out of scope for the first pilot launch?

### Evidence reference to use when recording approval
- `docs/pilot-approval-review-packet.md#5-product-review-lane`

## 6. Operations review lane

### Reviewer goal
Decide whether the runbooks, deletion expectations, and incident-handling preparation are sufficient for a controlled pilot.

### Read in this order
1. `docs/pilot-readiness.md`
2. `docs/data-flow.md`
3. `docs/glba-wisp-skeleton.md`
4. `docs/risk-assessment-template.md`

### Operations review questions
- Which runbooks still need a real drill or tabletop?
- What monitoring, alerting, and on-call expectations are required before pilot use?
- Is the deletion model operationally supportable?
- What business continuity / backup / restore evidence is required?

### Evidence reference to use when recording approval
- `docs/pilot-approval-review-packet.md#6-operations-review-lane`

## 7. Accessibility review lane

### Reviewer goal
Decide what accessibility evidence is still missing and whether a product surface exists to evaluate at all.

### Read in this order
1. `docs/pilot-readiness.md`
2. `docs/data-flow.md`

### Accessibility review questions
- Is there enough UI to evaluate, or is accessibility approval blocked until a real product surface exists?
- What WCAG 2.2 AA criteria should be mandatory before any consumer pilot?
- What review artifacts (audit, test plan, keyboard-flow evidence) will be required later?

### Evidence reference to use when recording approval
- `docs/pilot-approval-review-packet.md#7-accessibility-review-lane`

## Suggested approval-record format

When an accountable owner approves, record:
- **area**: one of `product | legal | privacy | security | operations | accessibility | vendor`
- **approver**: accountable person / role
- **evidenceReference**: stable reference such as this packet section, plus any external evidence link
- **approvedAt**: timestamp

Example evidence references:
- `docs/pilot-approval-review-packet.md#1-legal-review-lane`
- `docs/pilot-approval-review-packet.md#3-security-review-lane`
- `docs/pilot-approval-review-packet.md#4-vendor-review-lane`

## Immediate next actions

1. Send **legal** the legal lane packet (`ADR-0003`, `ADR-0004`, legal brief, data flow, privacy draft, ticket 12) using `docs/legal-approval-handoff.md`.
2. Send **privacy** the privacy notice + data flow using `docs/privacy-approval-handoff.md`.
3. Send **security** the data flow + WISP skeleton + risk template using `docs/security-approval-handoff.md`.
4. Ask the accountable owner for each lane to reply with one of:
   - **approved**
   - **approved with required edits**
   - **blocked**
   Use `docs/approval-handoff-template.md` to keep requests and responses consistent.
5. Record approvals only after accountable owners explicitly sign.

## Current limitation

This packet still cannot unblock:
- real encryption-at-rest / in-transit implementation,
- MFA / IAM / KMS choices,
- vendor contracts,
- final counsel clearance,
- accessibility approval without a real UI,
- launch itself.

It is preparation for those approvals, not a substitute for them.
