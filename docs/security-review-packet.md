# Security review packet (draft)

> **Status:** Working packet for security owner / security reviewer, not legal advice. This packet is for the current California one-state pilot and is designed to help answer whether the current safeguards plan is sufficient for the free invite-only pilot and what implementation evidence must exist before any real consumer use.

## Purpose

The current product is still an in-memory prototype, but the pilot approval gate assumes real security controls will exist before launch of the California pilot. This packet gathers the security-specific evidence, draft safeguards, and open risks so the security owner can review them as a coherent whole.

## What is already enforced in code or documented

- Written authorization gate before processing
- Consumer-only delivery model for the California pilot
- Upload validation / quarantine behavior
- Inbound redaction before analysis
- Reject-rather-than-guess parser behavior
- Output guard for exports / narration
- Deletion workflow with explicit delayed-processor tracking
- Match hardening / subgroup confirmation
- Redacted structured audit events
- Draft data-flow, WISP, and risk artifacts

## Read in this order

1. `docs/data-flow.md`
2. `docs/glba-wisp-skeleton.md`
3. `docs/risk-assessment-template.md`
4. `docs/pilot-readiness.md`
5. `docs/privacy-notice-draft.md`
6. `docs/legal-review-packet.md`
7. `.scratch/personal-credit-analysis-platform/issues/12-pilot-legal-conditions.md`
8. `.scratch/personal-credit-analysis-platform/issues/11-pilot-readiness.md`
9. `docs/pilot-approval-review-packet.md`

## Security review questions

### 1) Data path and asset inventory
- Does `docs/data-flow.md` correctly identify every place consumer report data enters, is processed, is stored, and is deleted?
- Are any assets or copies missing from the inventory (including backups, logs, caches, and optional narration/model-provider flows)?
- Is the consumer-only delivery model reflected correctly from a security perspective?

### 2) WISP completeness
- Does `docs/glba-wisp-skeleton.md` contain the right control families for the pilot?
- Which sections are mandatory before approval vs. acceptable as placeholders?
- Does the WISP need additional sections or a different structure for the accountable security owner?

### 3) Risk assessment and prioritization
- Which seeded risks in `docs/risk-assessment-template.md` should be scored highest for the actual deployment?
- Are any major risk scenarios missing?
- What evidence will security require to mark each high/critical item mitigated or accepted?

### 4) Encryption / IAM / MFA / KMS decisions
- What encryption-at-rest and encryption-in-transit controls are mandatory for the pilot?
- What KMS / key-management approach is acceptable?
- Where is MFA mandatory (infra, DB, admin tools, CI/CD, vendors)?
- What least-privilege model and access-review cadence are required?

### 5) Logging, monitoring, and incident response
- What logs are required, and where must log redaction be enforced?
- What monitoring / alerting thresholds are required before the pilot?
- What incident response / breach notification evidence must exist before sign-off?
- Are runbooks or tabletop exercises required before approval?

### 6) Vendor and processor security
- Which processor categories are acceptable for the pilot?
- What vendor diligence / DPA / security questionnaire evidence is required for each?
- What incident-notification, deletion, subprocessor, and data-residency terms are mandatory?
- Are any contemplated processors incompatible with the pilot's constraints?

### 7) Residual-risk decision
- What risks are acceptable for a free invite-only pilot?
- Which risks are launch blockers?
- Which risks can be accepted temporarily only with explicit sign-off and compensating controls?

## Evidence references for approval records

Use one of these stable anchors if the security owner approves, requests changes, or blocks the California pilot:
- `docs/security-review-packet.md#1-data-path-and-asset-inventory`
- `docs/security-review-packet.md#2-wisp-completeness`
- `docs/security-review-packet.md#3-risk-assessment-and-prioritization`
- `docs/security-review-packet.md#4-encryption--iam--mfa--kms-decisions`
- `docs/security-review-packet.md#5-logging-monitoring-and-incident-response`
- `docs/security-review-packet.md#6-vendor-and-processor-security`
- `docs/security-review-packet.md#7-residual-risk-decision`

## Open items this review should resolve

The security review should explicitly resolve or narrow these ticket-12 / ticket-11 items before the California pilot can be treated as ready for human approval:
- reports encrypted in transit and at rest,
- written information-security program with a designated responsible individual,
- documented risk assessment,
- MFA and least-privilege access controls,
- vendor due diligence and contractual security/deletion/incident terms,
- incident-response plan,
- vendor security / data residency / key management / subprocessors / deletion SLAs,
- what evidence is required before security approval can be recorded.

## Suggested reviewer responses

Security can respond with one of:
- **approved for free pilot**
- **approved with required controls / evidence**
- **blocked**

If additional controls or evidence are required, please specify:
- the exact missing control,
- the required proof artifact (policy, screenshot, config, contract, drill record, etc.),
- whether the item is a launch blocker or a follow-up item.

## What this packet does **not** do

This packet does not:
- implement encryption,
- choose a hosting / KMS / IAM stack,
- complete vendor due diligence,
- replace a final risk review,
- approve production deployment on its own.

It exists to make the security review explicit, evidence-linked, and actionable for the California pilot.
