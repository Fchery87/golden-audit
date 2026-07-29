# Invite-only pilot readiness evidence

This document records the executable and human approval gates for the initial California-only controlled pilot. The repository contains the accountable approval record for the controlled-pilot implementation.

## Automated gates

Run `npm run verify:pilot`. The suite covers:

- authentication, revoked sessions, tenant isolation, and IDOR-style cross-tenant access;
- upload authorization expiry, file-signature validation, resource limits, malware/prompt-content quarantine, and private artifact handling;
- provenance-preserving parsing, masking, deterministic matching/analysis, suppression, reproducibility, exports, deletion, and narration fallback;
- structured audit coverage and telemetry redaction checks.

## Accessibility target

Core interactive surfaces must meet WCAG 2.2 AA. Before inviting consumers, record evidence for keyboard-only operation, visible focus, accessible names, screen-reader flow, contrast, 200% zoom/reflow, and exported-document readability. The current ticket implementation exposes domain boundaries and tests but does not claim a production UI accessibility certification.

## Vendor gate

Before controlled pilot reports are processed, security and privacy owners must approve evidence for data residency, encryption in transit/at rest, tenant isolation, key management, subprocessors, incident notification, deletion SLAs, backup lifecycle, and provider training/retention exclusions.

## Runbooks and exercises

| Scenario | Containment | Recovery evidence |
| --- | --- | --- |
| Parser regression | Disable parser version and stop affected jobs | Re-run golden fixtures, publish a new parser version, preserve prior normalized versions |
| Malware quarantine | Isolate object and deny parsing/egress | Review scan metadata, delete according to retention policy, record security event |
| Model/provider outage | Disable generated narration | Deterministic report remains available; re-enable only after health and safety checks |
| Unsafe model output | Reject output and activate deterministic fallback | Preserve validation reason and model/prompt versions for review |
| Cross-tenant alert | Revoke sessions and isolate affected service | Audit IDOR/storage checks and document incident scope |
| Deletion failure | Keep job visible in retry/pending state | Retry idempotently and record active-system plus provider/backup completion evidence |
| Legal/content disablement | Emergency-disable affected governed item | Publish replacement immutable version after approval |
| Credential exposure | Revoke credentials and sessions | Rotate secrets, inspect audit trail, and validate least privilege |
| Rollback | Pin previous app/parser/rules/content/model versions | Reproduce the affected analysis from immutable version records |

Exercises must record date, owner, result, gaps, and follow-up ticket.

## Evaluation corpus and reporting

Use only synthetic or explicitly authorized fixtures. Report parser field precision/recall, account-match precision, finding positive predictive value, citation validity, narration safety, comprehension, accessibility results, and latency separately by supported provider, document type, and relevant user segment. Aggregate-only reporting is insufficient.

## Retention/deletion drill

For each supported provider and storage adapter, demonstrate deletion of active objects, normalized data, analyses, exports, indexes, and caches. Record delayed backup/provider artifacts separately and disclose their lifecycle; never report deletion complete while an active-system artifact remains.

## Required human approvals

The application exposes a fail-closed pilot gate for these approval areas: `product`, `legal`, `privacy`, `security`, `operations`, `accessibility`, and `vendor`. Each approval requires an accountable approver and an evidence reference; the controlled pilot cannot be marked ready until all seven are recorded. The launch scope must also be explicitly configured (current recommended posture: one-state free pilot).

`docs/pilot-approval-records.json` remains a **test fixture**, not a source of real approvals. It may be used to hydrate launch-scope metadata for local/runtime gating, but accountable human approvals must still be recorded separately before any real pilot can be considered ready.
