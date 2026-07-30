# Incident response plan (pilot template)

> **Status:** Working template for the current California one-state pilot. This is not approval and not production certification.

## 1. Purpose
Define how the pilot detects, triages, contains, investigates, and recovers from security or privacy incidents involving consumer information.

## 2. Scope
Applies to incidents involving:
- uploaded consumer reports
- normalized report data
- analyses / exports
- account/session data
- audit logs or telemetry that may expose sensitive activity
- backup or processor copies of the above

## 3. Roles
- **Incident owner:** `[NAME / ROLE]`
- **Security lead:** `[NAME / ROLE]`
- **Privacy/legal escalation:** `[NAME / ROLE]`
- **Operations lead:** `[NAME / ROLE]`
- **Communications owner:** `[NAME / ROLE]`

## 4. Severity levels
- **SEV-1:** confirmed or likely sensitive-data exposure, cross-tenant exposure, or active compromise
- **SEV-2:** major service failure or control failure with plausible consumer impact
- **SEV-3:** contained issue with limited operational impact and no evidence of exposure

## 5. Response flow
1. Detect and open incident record
2. Assign severity and owner
3. Contain affected systems or features
4. Preserve evidence and relevant logs
5. Investigate scope, impacted data, and timeline
6. Recover service safely
7. Decide whether internal, vendor, customer, or regulator notifications are required
8. Record corrective actions and follow-up owner/date

## 6. Containment playbooks
### Cross-tenant alert
- Revoke affected sessions
- Isolate impacted surface or endpoint
- Review audit and runtime events
- Confirm scope before restoring access

### Malware / malicious upload
- Quarantine upload
- Block further processing/egress
- Review scan and parser metadata
- Delete or retain safely per policy

### Persistence / deletion failure
- Pause destructive confirmation claims
- Verify active-system deletion state
- Identify delayed processors/backups still pending
- Retry or escalate restore/deletion workflow

### Credential exposure
- Rotate credentials
- Revoke sessions/tokens
- Review privileged access and recent changes
- Confirm MFA posture before restoring normal access

## 7. Evidence to retain
- incident ID
- opened/closed timestamps
- owner and participants
- affected systems/data categories
- containment and recovery actions
- notification decision
- follow-up ticket(s)

## 8. Drill record reference
Record at least one tabletop or exercised drill before pilot use. Link each drill to `docs/runbook-drill-record-template.md`.
