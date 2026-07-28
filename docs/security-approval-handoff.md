# Security approval handoff request (ready to send)

## To: `[SECURITY OWNER / SECURITY REVIEWER NAME / ROLE]`

### Review lane
`security`

### Decision requested
Please review the attached security packet and reply with one of:
- **approved**
- **approved with required controls / evidence**
- **blocked**

### Primary packet
`docs/security-review-packet.md`

### Supporting artifacts
- `docs/data-flow.md`
- `docs/glba-wisp-skeleton.md`
- `docs/risk-assessment-template.md`
- `docs/privacy-notice-draft.md`
- `docs/pilot-readiness.md`
- `.scratch/personal-credit-analysis-platform/issues/12-pilot-legal-conditions.md`
- `.scratch/personal-credit-analysis-platform/issues/11-pilot-readiness.md`

### What to answer
1. **Decision**: approved / approved with required controls / evidence / blocked
2. **Required controls / evidence** (if any): exact missing control or proof needed
3. **Blocking severity**: pilot blocker or follow-up item
4. **Evidence reference**: stable anchor from the packet you reviewed
5. **Approver identity**: your name / role / accountable owner

### Highest-priority questions for this review
- Does the current data-flow correctly identify all assets / copies of customer information?
- Is the WISP skeleton sufficient, and what sections are still mandatory before approval?
- Which risks in the current template are launch blockers?
- What encryption / IAM / MFA / KMS decisions and evidence are mandatory for the pilot?
- What vendor / processor security requirements must be satisfied before launch?
- What incident-response, logging, and monitoring evidence must exist before sign-off?

### Evidence reference examples
- `docs/security-review-packet.md#1-data-path-and-asset-inventory`
- `docs/security-review-packet.md#2-wisp-completeness`
- `docs/security-review-packet.md#3-risk-assessment-and-prioritization`
- `docs/security-review-packet.md#4-encryption--iam--mfa--kms-decisions`
- `docs/security-review-packet.md#5-logging-monitoring-and-incident-response`
- `docs/security-review-packet.md#6-vendor-and-processor-security`
- `docs/security-review-packet.md#7-residual-risk-decision`

### Suggested reply format
```text
approved with required controls / evidence

Required controls / evidence:
- [exact control or evidence artifact]
- [exact control or evidence artifact]

Blocking severity: [pilot blocker | follow-up item]
Evidence reference: docs/security-review-packet.md#[anchor]
Approver: [name], [role]
```
