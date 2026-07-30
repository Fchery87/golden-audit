# Pilot risk assessment (working)

> **Status:** Working assessment for the current California one-state pilot. Not legal advice. This is a filled-in starting point for accountable-owner review; owners and dates still need confirmation.

## 1. Objective

Identify the most likely and highest-impact risks to consumer report information in the California pilot, score them, and record the current control state plus the remaining evidence needed before pilot approval.

Use together with:
- `docs/data-flow.md`
- `docs/glba-wisp-skeleton.md`
- `docs/privacy-notice-draft.md`
- `docs/pilot-readiness.md`
- `docs/ops-runbook.md`

## 2. Scoring notes

Scores below are **initial recommendations** based on the current repo docs and implementation posture. They are not final approval decisions.

## 3. Risk register (initial fill)

| ID | Asset / process | Threat scenario | Likelihood | Impact | Current controls | Gaps / questions | Owner | Target date | Status / residual risk |
|---|---|---|---:|---:|---|---|---|---|---|
| R-01 | Uploaded report intake | Malformed or malicious report triggers unsafe processing | 2 | 4 | Media-type validation, PDF structural checks, HTML quarantine, reject-rather-than-guess | Need production sandboxing / AV strategy decision | Security | TBD | Medium; keep quarantine/reject controls mandatory |
| R-02 | Raw PDF storage | Raw report bytes are stored longer than intended or exposed | 3 | 4 | Private raw bytes in prototype; deletion path exists; retention disclosed | Need persisted-storage design, encryption-at-rest, backup retention controls | Security / Ops | TBD | High; block pilot on storage and backup evidence |
| R-03 | Telemetry / logs | Identifiers or raw report text leak into logs or traces | 3 | 4 | Inbound redaction, output guard, redacted audit events tested | Need production logging config, vendor review, retention periods | Security / Privacy | TBD | High; require log-redaction evidence |
| R-04 | Cross-tenant access | One consumer accesses another consumer's report or export | 3 | 5 | Session/user checks, tenant-isolation tests | Need real DB authorization model / least-privilege design | Security | TBD | High; gate on tenant-isolation evidence |
| R-05 | Matching / analysis integrity | Collision set or incorrect match causes misleading findings | 3 | 3 | Matching hardening, subgroup confirmation, deterministic analysis core | Need labeled truth or richer parser fields for higher PPV confidence | Product / Security | TBD | Medium; acceptable only with documented confidence limits |
| R-06 | Narration provider (if enabled) | External provider retains or misuses report-derived payloads | 2 | 4 | Constrained payload, output guard, no-training policy, delayed deletion tracking | Need contract / DPA review, feature flag decision, retention confirmation | Security / Vendor | TBD | Medium; keep disabled until vendor evidence exists |
| R-07 | Backup lifecycle | Deleted reports remain in backups longer than disclosed | 3 | 4 | Delayed deletion tracked explicitly | Need documented backup retention, restore test, purge policy | Operations / Security | TBD | High; require restore and purge evidence |
| R-08 | Vendor sprawl | A processor touches customer information without approved terms | 3 | 4 | Vendor gate exists in pilot approval model | Need inventory, DPA status, incident contacts, subprocessor review | Vendor / Privacy | TBD | High; no unreviewed processor use |
| R-09 | Account compromise | Weak auth or missing MFA on privileged systems leads to unauthorized access | 3 | 4 | Password hashing in prototype, session revocation tests | Need production MFA, IAM review, admin-access policy | Security / Ops | TBD | High; require MFA and privileged access controls |
| R-10 | Misdirected delivery | Outputs are delivered to third parties or used for ineligible decisioning | 2 | 5 | Consumer-only model, no third-party delivery API path, output guard | Need legal/privacy review of terms, product surface, support workflows | Product / Legal / Privacy | TBD | High; keep consumer-only boundary explicit |
| R-11 | Retention / minimization | Data collected or retained beyond what the pilot needs | 3 | 4 | Authorization text + retention policy; deletion workflow | Need final retention schedule by category and enforcement evidence | Privacy / Security | TBD | High; finalize per-category retention before pilot |
| R-12 | Change / deployment | Unreviewed code or infra change weakens safeguards | 3 | 4 | Git history, tests, pilot gate | Need CI/CD approvals, secret management, rollback, prod separation | Ops / Security | TBD | High; require change-management and rollback evidence |

## 4. Priorities

### Highest priority
- R-04 Cross-tenant access
- R-02 Raw PDF storage
- R-03 Telemetry / logs
- R-07 Backup lifecycle
- R-08 Vendor sprawl
- R-09 Account compromise
- R-11 Retention / minimization
- R-12 Change / deployment

### Medium priority
- R-01 Uploaded report intake
- R-05 Matching / analysis integrity
- R-06 Narration provider (if enabled)
- R-10 Misdirected delivery

## 5. Minimum evidence expected before pilot approval

- completed scores and owners for every risk
- named remediation plan for every high / critical item
- documented rationale for any accepted residual risk
- linkage to vendor reviews, WISP sections, and privacy notice disclosures
- confirmation that the deployment architecture still matches `docs/data-flow.md`
- at least one exercised runbook or tabletop for each critical scenario

## 6. Remaining human-gated evidence

- WISP owner and approval sign-off
- vendor inventory and contract status
- security / privacy approval references
- operations drill evidence
- final privacy notice and retention wording

## 7. Review cadence

- Update after every evidence-gathering change
- Review before first real consumer pilot use
- Review after any material vendor / architecture change
- Review after any incident or near miss
