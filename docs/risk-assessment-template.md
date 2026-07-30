# Risk assessment template (pilot)

> **Status:** Draft working template, not legal advice. Prepared to support the ticket-12 security / GLBA gate. This is a template with seeded risks from the current architecture; accountable owners must complete scoring, ownership, target dates, and residual-risk acceptance.

## 1. Objective

Identify reasonably foreseeable internal and external risks to consumer report information, score those risks, map existing controls, and document remediation or acceptance decisions for the current California one-state pilot.

Use this template together with:
- `docs/data-flow.md`
- `docs/glba-wisp-skeleton.md`
- `docs/privacy-notice-draft.md`
- `docs/pilot-readiness.md`

## 2. Scoring rubric

### Likelihood
- **1 — Rare:** difficult to trigger; multiple safeguards already exist
- **2 — Unlikely:** possible but not expected in ordinary operation
- **3 — Possible:** realistic in the absence of additional safeguards
- **4 — Likely:** expected under current conditions without prompt remediation
- **5 — Almost certain:** already observed or trivially exploitable

### Impact
- **1 — Negligible:** minimal operational or consumer effect
- **2 — Low:** limited, recoverable effect
- **3 — Moderate:** meaningful operational disruption or consumer harm
- **4 — High:** major confidentiality / integrity / availability impact
- **5 — Severe:** broad sensitive-data exposure, regulatory escalation, or existential product harm

### Suggested priority heuristic
`priority = likelihood × impact`

- **1–4:** low
- **5–9:** medium
- **10–15:** high
- **16–25:** critical

## 3. Risk register

| ID | Asset / process | Threat scenario | Likelihood | Impact | Current controls | Gaps / questions | Owner | Target date | Status / residual risk |
|---|---|---|---:|---:|---|---|---|---|---|
| R-01 | Uploaded report intake | A malicious or malformed report triggers unsafe processing or code execution |  |  | Media-type validation, PDF structural checks, HTML quarantine checks, reject-rather-than-guess | Need production sandboxing / AV strategy decision |  |  |  |
| R-02 | Raw PDF storage | Raw report bytes are stored longer than intended or exposed through an unintended path |  |  | `rawUploadBytes` private map in prototype; deletion path exists; retention policy disclosed | Need persisted-storage design, encryption-at-rest, backup retention controls |  |  |  |
| R-03 | Telemetry / logs | Full identifiers or raw report text leak into logs, traces, or analytics |  |  | Inbound redaction, output guard, redacted audit events tested | Need production logging configuration / vendor review / retention periods |  |  |  |
| R-04 | Cross-tenant access | One consumer can access another consumer's report, analysis, or export |  |  | Session/user checks, tenant-isolation tests | Need real DB authorization model / least-privilege service design |  |  |  |
| R-05 | Matching / analysis integrity | A collision set or incorrect match causes misleading findings |  |  | Matching hardening, subgroup confirmation, deterministic analysis core, measurement harnesses | Need labeled truth or richer parser fields for higher PPV confidence |  |  |  |
| R-06 | Narration provider (if enabled) | External model provider retains or misuses report-derived payloads |  |  | Constrained payload, output guard, no-training product policy, delayed-deletion tracking | Need contract / DPA review, feature flag decision, deletion / retention confirmation |  |  |  |
| R-07 | Backup lifecycle | Deleted reports remain in backups longer than disclosed or cannot be located |  |  | Delayed deletion tracked explicitly | Need documented backup retention, restore-test, and purge policy |  |  |  |
| R-08 | Vendor sprawl | A processor touches customer information without approved diligence / contract terms |  |  | Vendor gate exists in pilot approval model | Need inventory, DPA status, incident contacts, subprocessor review |  |  |  |
| R-09 | Account compromise | Weak authentication or missing MFA on privileged systems leads to unauthorized access |  |  | Password hashing in prototype, session revocation tests | Need production MFA, IAM review, admin-access policy |  |  |  |
| R-10 | Misdirected delivery | Outputs are delivered to third parties or used for ineligible decisioning |  |  | Consumer-only product model, no third-party delivery API path, output guard | Need legal/privacy review of terms, product surface, support workflows |  |  |  |
| R-11 | Retention / minimization | Data is collected or retained beyond what the free pilot actually needs |  |  | Authorization text + retention policy; deletion workflow | Need final retention schedule by category and enforcement evidence |  |  |  |
| R-12 | Change / deployment | An unreviewed code or infrastructure change weakens safeguards in production |  |  | Git history, tests, pilot gate | Need CI/CD approvals, secret management, rollback, production separation |  |  |  |

## 4. Required assessment steps

For each risk:
1. confirm the asset / process in scope,
2. score likelihood and impact,
3. describe the current control state,
4. identify gaps or assumptions,
5. assign an owner and target date,
6. decide whether to mitigate, transfer, accept, or avoid,
7. record residual risk and approval.

## 5. Minimum evidence expected before pilot approval

- completed scores and owners for every in-scope risk,
- named remediation plan for every high / critical item,
- documented rationale for any accepted residual risk,
- linkage to vendor reviews, WISP sections, and privacy notice disclosures,
- confirmation that the final deployment architecture still matches `docs/data-flow.md`,
- evidence of at least one exercised runbook or tabletop for each critical scenario.

## 6. Review cadence

Suggested review triggers:
- before first real consumer pilot use,
- after any material vendor / architecture change,
- after any incident or near miss,
- at least annually while the product remains active.
- For the pilot phase, review the register after each evidence-gathering change.
