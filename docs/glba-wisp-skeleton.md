# GLBA WISP skeleton (draft)

> **Status:** Draft working skeleton, not legal advice. Prepared to support the ticket-12 / ADR-0004 assumption that the **GLBA Safeguards Rule applies unless counsel clears us out**. This is not a final policy and must be completed by accountable owners.

## 1. Purpose and scope

This Written Information Security Program (WISP) describes the administrative, technical, and physical safeguards the pilot must maintain to protect consumer report information and related account/session data.

**In scope information:**
- uploaded consumer credit reports,
- normalized report data and provenance,
- analysis outputs / exports,
- account/session data,
- consent / authorization records,
- audit logs that could reveal sensitive activity,
- any backup or processor copies of the above.

**Out of scope:** public documentation, synthetic fixtures with fictitious values, and infrastructure that provably never processes customer information.

## 2. Governing assumptions

- **ADR-0004:** treat GLBA Safeguards as applicable until formally cleared.
- **ADR-0003:** free invite-only pilot only; consumer-uploaded reports only; consumer-only delivery.
- **Data minimization:** collect only what the pilot needs to authenticate the consumer, receive the report, analyze it, and return educational output to the consumer.
- **No sale / no advertising / no training on report data.**

## 3. Designated responsible individual

- **Responsible individual:** `[NAME / ROLE]`
- **Backup owner:** `[NAME / ROLE]`
- **Approval authority:** `[NAME / ROLE]`
- **Evidence reference:** `[stable anchor in the security evidence tracker / approval packet]`

Responsibilities include:
- maintaining this program,
- ensuring the risk assessment is completed and refreshed,
- reviewing vendor due diligence,
- overseeing incident response,
- reporting material issues to leadership,
- confirming safeguards are adjusted when the business, threat landscape, or vendor set changes.

## 4. Information inventory

Reference the current **data-flow diagram** (`docs/data-flow.md`) as the system-of-record picture of where consumer report data enters, is processed, is stored, and is deleted.

Minimum tracked asset categories:
- authentication / session systems,
- upload staging,
- raw PDF storage,
- normalized report storage,
- analysis / export storage,
- backup systems,
- narration/model provider (if enabled),
- monitoring / logging systems,
- admin / support access paths.

## 5. Risk assessment requirement

A documented risk assessment must exist and be reviewed at least annually and after material changes.

The risk assessment should evaluate, at minimum:
- unauthorized access to uploaded reports,
- cross-tenant data access,
- log / telemetry leakage of identifiers,
- malicious document or prompt-injection content,
- vendor compromise or unauthorized subprocessing,
- delayed deletion / backup retention gaps,
- account compromise / weak authentication,
- accidental third-party delivery,
- insider misuse / over-broad access,
- insecure change management / deployment.

Reference template: `docs/risk-assessment-template.md`.

## 6. Administrative safeguards

### 6.1 Access governance
- Least-privilege access by default
- Named accounts only; no shared credentials for privileged systems
- Access approval / revocation workflow documented
- Joiner / mover / leaver process
- Periodic access review cadence `[MONTHLY / QUARTERLY]`
- Pilot evidence: include the owner of the privileged-access review and the review date.

### 6.2 MFA
- MFA required for:
  - production infrastructure
  - database / storage consoles
  - admin/support tools
  - code hosting and CI/CD
  - vendor dashboards processing customer information
- Pilot evidence: list each protected system and how MFA is enforced.

### 6.3 Training
- Security / privacy training cadence `[ANNUAL]`
- Targeted handling guidance for customer report data
- Incident reporting channel documented

### 6.4 Change management
- Review and approval process for production changes
- Secret management process
- Rollback / recovery plan

## 7. Technical safeguards

### 7.1 Encryption
- Encryption **in transit** for all network paths handling consumer information
- Encryption **at rest** for report storage, databases, backups, and any processor storage holding customer information
- Key management owner / system: `[KMS / HSM / provider-managed]`
- Key rotation cadence: `[SCHEDULE]`
- Pilot evidence: confirm the storage and backup layers that must be encrypted and the responsible owner.

### 7.2 Data minimization / retention
- Originals retained only as long as operationally necessary, with a stated maximum
- Consumer deletion control available
- Backups and delayed processors tracked explicitly
- No unnecessary copies in analytics, QA, or training sets

### 7.3 Logging / monitoring
- Security-relevant actions logged
- Raw report text and full identifiers excluded from telemetry where possible
- Alerting thresholds for suspicious activity documented
- Log retention period documented

### 7.4 Secure processing boundaries
- Inbound redaction boundary before extraction where applicable
- Output guard before consumer-visible export / narration
- Quarantine / reject rather than guess on unsupported or malicious inputs

### 7.5 Environment separation
- Development, staging, and production separation
- Synthetic data only outside explicitly approved controlled environments
- No real consumer reports in ordinary local dev without explicit authorization and handling constraints

## 8. Vendor oversight

Every processor handling consumer information must be covered by:
- confidentiality obligations,
- security obligations,
- deletion / return commitments,
- incident-notification duties,
- subprocessors disclosure / approval terms,
- data residency review,
- training / retention evidence where relevant,
- pilot approval evidence reference.

Maintain a vendor inventory with:
- vendor name,
- service category,
- data touched,
- contract / DPA status,
- owner,
- renewal date,
- incident contact,
- deletion mechanism.

## 9. Incident response

A written incident response plan must exist and define:
- how incidents are detected and triaged,
- severity levels,
- roles and decision-makers,
- containment / eradication / recovery steps,
- evidence preservation,
- internal escalation,
- customer / regulator / vendor notification decision path,
- post-incident review and corrective actions.

At least one tabletop or drill should be recorded before pilot launch.
- Pilot evidence: record the latest drill date, owner, and follow-up ticket.

## 10. Testing and adjustment

The program should be adjusted based on:
- risk assessment output,
- incidents / near misses,
- vendor changes,
- product / architecture changes,
- legal / regulatory guidance,
- penetration testing / code review / operational findings.

Review cadence: `[AT LEAST ANNUAL]`

## 11. Required open fields before approval

Fill these before treating the WISP as operational:
- designated responsible individual
- production architecture / vendor list
- encryption / KMS details
- MFA / IAM specifics
- access review cadence
- logging / retention periods
- backup retention and deletion approach
- incident response owner and escalation path
- vendor inventory and contract status
- review / approval signatures
- pilot evidence references

## 12. Companion artifacts

This skeleton depends on and should align with:
- `docs/data-flow.md`
- `docs/privacy-notice-draft.md`
- `docs/risk-assessment-template.md`
- `docs/pilot-readiness.md`
- retained counsel review of authorization / terms / privacy / retention / vendor/data flow
