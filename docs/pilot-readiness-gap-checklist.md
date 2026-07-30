# Pilot readiness gap checklist

> **Status:** Working checklist for the current California one-state pilot. This is not approval and not production certification. It turns the remaining readiness docs into a concrete closeout list.

## 1) Human approvals still missing
- [ ] Product approval recorded
- [ ] Legal approval recorded
- [ ] Privacy approval recorded
- [ ] Security approval recorded
- [ ] Operations approval recorded
- [ ] Accessibility approval recorded
- [ ] Vendor approval recorded

## 2) Security / GLBA evidence
- [ ] Written information-security program with a designated responsible individual
- [ ] Documented risk assessment completed and scored
- [ ] MFA and least-privilege access controls documented
- [ ] Vendor due diligence completed for every processor
- [ ] Security / deletion / incident terms captured for every processor
- [ ] Incident-response plan documented
- [ ] Encryption in transit and at rest confirmed for the pilot architecture
- [ ] Backup retention and restore policy documented
- [ ] Provisional backend architecture recorded as Pages Functions + D1 + R2

## 3) Operations evidence
- [ ] Observability events defined and surfaced for analysis, upload, persistence, and approval failures
- [ ] Working observability record started in `docs/observability-evidence-working.md`
- [ ] Secret storage location and access restrictions documented
- [ ] Working secrets/access record started in `docs/secrets-access-evidence-working.md`
- [ ] Restore steps documented
- [ ] At least one restore test recorded using `docs/restore-test-record-template.md`
- [ ] Working restore record started in `docs/restore-test-record-working.md`
- [ ] At least one runbook drill or tabletop recorded for each critical scenario using `docs/runbook-drill-record-template.md`
- [ ] Working drill record started in `docs/runbook-drill-record-working.md`
- [ ] Drill records include date, owner, result, gaps, and follow-up ticket

## 4) Privacy evidence
- [ ] Notice-at-collection / transparency framing finalized for the California pilot
- [ ] Working privacy evidence record started in `docs/privacy-evidence-working.md`
- [ ] Retention periods finalized by category
- [ ] Rights language reviewed for the intended pilot jurisdiction
- [ ] Processor / sharing disclosures aligned with `docs/data-flow.md`
- [ ] No-sale / no-ad / no-training language explicit in the notice if required

## 5) Vendor evidence
- [ ] Processor inventory complete using `docs/vendor-inventory-template.md`
- [ ] Working provider rows started in `docs/vendor-inventory-working.md`
- [ ] DPA / confidentiality / deletion / incident notification obligations captured
- [ ] Subprocessor review completed
- [ ] Data residency / key-management expectations documented where applicable
- [ ] Pages Functions identified as the provisional backend for the pilot

## 6) Pilot evidence bundle
- [ ] `docs/risk-assessment-working.md` completed with owners, target dates, and residual-risk decisions
- [ ] `docs/ops-runbook.md` exercise evidence attached
- [ ] `docs/pilot-approval-review-packet.md` ready for accountable-owner review
- [ ] `docs/legal-review-packet.md`, `docs/privacy-review-packet.md`, and `docs/security-review-packet.md` reflect the California one-state pilot scope
- [ ] `docs/glba-wisp-skeleton.md` reflects named ownership and evidence references
- [ ] `docs/privacy-notice-draft.md` reflects the California pilot scope and current data-flow
- [ ] `docs/privacy-evidence-working.md` is used as the privacy proof index
- [ ] `docs/incident-response-plan.md` exists and is linked from the security evidence set
- [ ] `docs/pilot-stack-implementation-plan.md` records the provisional Cloudflare Pages + Pages Functions + D1 + R2 pilot stack

## 7) Not done yet
- [ ] Do not record real approvals in `docs/pilot-approval-records.json` until accountable owners respond
- [ ] Do not claim production certification
- [ ] Do not claim nationwide readiness

## Closeout condition
This checklist is complete only when the approval gate is populated with real accountable-owner sign-off and the required evidence references are recorded.
