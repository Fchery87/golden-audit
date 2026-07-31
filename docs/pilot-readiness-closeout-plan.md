# Pilot readiness closeout plan

> **Status:** Working execution plan for the current California one-state pilot. This is not approval and not production certification.

## Goal
Close the remaining readiness gaps in the shortest safe order:
1. security evidence
2. operations evidence
3. privacy/vendor evidence
4. approval packet assembly

## Phase 1 — Security evidence
### Outcome
Enough security evidence exists to support review of the pilot as a controlled California release.

### Tasks
- Complete `docs/risk-assessment-template.md` with likelihood, impact, owners, target dates, and residual-risk decisions.
- Fill the GLBA/WISP draft with the required responsible individual and control ownership.
- Inventory processors and record the required contractual/security obligations for each.
- Confirm encryption in transit / at rest, MFA, least privilege, and incident-response expectations in writing.
- Preserve the verified Cloudflare pilot deployment evidence (Pages alias URL, D1 id, R2 bucket, remote smoke pass) as references in the security packet set.

### Done when
- Every high/critical risk has an owner and target date.
- Every vendor/processor has a recorded diligence status.
- The security review packet can be answered with evidence references instead of generalities.

## Phase 2 — Operations evidence
### Outcome
Core operational readiness evidence exists for observability, backup/restore, and incident handling.

### Tasks
- Record one example of each event class called out in `docs/ops-runbook.md`.
- Document secrets storage and access restrictions.
- Record backup target, restore steps, and last restore test result.
- Exercise each critical runbook and capture the drill log.
- Keep the deployed Pages verification commands and successful smoke output linked from the working ops evidence set.

### Done when
- At least one restore test exists.
- At least one drill log exists for each critical scenario.
- The ops review can point to recorded evidence, not just notes.

## Phase 3 — Privacy/vendor evidence
### Outcome
The privacy notice and processor disclosures are ready for accountable-owner review.

### Tasks
- Finalize notice-at-collection language for the California pilot.
- Confirm retention and deletion statements by category.
- Confirm processor / sharing disclosures align with `docs/data-flow.md`.
- Capture vendor DPA / deletion / incident notification status.
- Convert the current Cloudflare working inventory into accountable-owner reviewed vendor evidence.

### Done when
- The privacy packet can be reviewed against a coherent draft notice.
- The vendor lane has a completed inventory and contract-status view.

## Phase 4 — Approval packet assembly
### Outcome
The approval lanes are ready to send and record.

### Tasks
- Review `docs/pilot-approval-review-packet.md`.
- Fill `docs/approval-handoff-template.md` for each lane.
- Send legal, privacy, security, ops, accessibility, product, and vendor requests.
- Record only explicit accountable-owner approvals.

### Done when
- Every lane has a sent request.
- Every approval has an evidence reference.
- `docs/pilot-approval-records.json` remains empty of real approvals until sign-off exists.

## Open constraint
Human approvals are still required; this plan only reduces the work needed to earn them.

## Current verified implementation evidence
- Cloudflare Pages alias URL: `https://main.golden-audit-pilot.pages.dev`
- Verified preview deployment URL: `https://91794dbe.golden-audit-pilot.pages.dev`
- D1 database: `golden-audit-pilot` (`e24d3d92-0f9d-4cf1-a31f-f47b733e3432`)
- R2 bucket: `golden-audit-pilot-uploads`
- Remote smoke passed on 2026-07-31 with overall `{"status":"ok"}`
- Remote D1 migration `003_pilot_pages_state` applied and verified
