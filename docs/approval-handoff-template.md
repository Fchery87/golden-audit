# Approval handoff template (draft)

> **Status:** Working template for sending each review packet to an accountable owner. This is not an approval; it is the request that should produce one.

## Use

Fill one copy of this template per review lane (legal, privacy, security, vendor, product, operations, accessibility) and send it together with the relevant packet.

---

## To: `[REVIEWER NAME / ROLE]`

### Review lane
`[legal | privacy | security | vendor | product | operations | accessibility]`

### Decision requested
Please review the attached packet and reply with one of:
- **approved**
- **approved with required edits**
- **blocked**

### Primary packet
`[docs/legal-review-packet.md | docs/privacy-review-packet.md | docs/security-review-packet.md | docs/pilot-approval-review-packet.md]`

### Supporting artifacts
- `docs/data-flow.md`
- `docs/glba-wisp-skeleton.md`
- `docs/privacy-notice-draft.md`
- `docs/risk-assessment-template.md`
- `docs/pilot-readiness.md`
- `docs/legal-pre-mortem-brief.md`
- `.scratch/personal-credit-analysis-platform/issues/11-pilot-readiness.md`
- `.scratch/personal-credit-analysis-platform/issues/12-pilot-legal-conditions.md`

### What to answer
1. **Decision**: approved / approved with required edits / blocked
2. **Required edits** (if any): exact wording or control changes needed
3. **Blocking severity**: pilot blocker or follow-up item
4. **Evidence reference**: stable anchor from the packet you reviewed
5. **Approver identity**: your name / role / accountable owner

### Evidence reference format
Use a stable anchor like:
- `docs/legal-review-packet.md#1-cra--cro-boundary`
- `docs/privacy-review-packet.md#2-retention-and-deletion`
- `docs/security-review-packet.md#3-risk-assessment-and-prioritization`
- `docs/pilot-approval-review-packet.md#4-vendor-review-lane`

### Example response
```text
approved with required edits

Required edits:
- tighten the retention language to specify [X] days for [Y] artifact
- list the optional narration provider by category in the notice

Blocking severity: pilot blocker until edits are made
Evidence reference: docs/privacy-review-packet.md#2-retention-and-deletion
Approver: Jane Doe, Privacy Owner
```

---

## Reminder to sender

Do **not** record the approval in `docs/pilot-approval-records.json` unless the accountable owner has explicitly responded with an approval decision and evidence reference.
