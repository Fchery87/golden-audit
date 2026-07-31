# Observability evidence (working)

> **Status:** Working record for the current California one-state pilot. This is not approval and not production certification. It captures the evidence that required event classes are defined and visible.

## Required event classes
- analysis failure
- upload failure
- persistence failure
- rejected approval
- privileged / security-relevant action

## Evidence table

| Event class | Where surfaced | Example evidence reference | Redaction verified | Notes |
|---|---|---|---|---|
| analysis failure | runtime events, admin surface, logs | `docs/ops-runbook.md` / `docs/pilot-readiness-gap-checklist.md` | yes | Analysis failures are defined and surfaced through the runtime event stream; live example to be captured in a follow-up drill. |
| upload failure | runtime events, admin surface, logs | `docs/ops-runbook.md` / `docs/pilot-readiness-gap-checklist.md` | yes | Upload failures are defined and surfaced through the runtime event stream; live example to be captured in a follow-up drill. |
| persistence failure | runtime events, admin surface, logs | `docs/ops-runbook.md` / `docs/pilot-readiness-gap-checklist.md` | yes | Persistence failures are defined and surfaced through the runtime event stream; live example to be captured in a follow-up drill. |
| rejected approval | runtime events, admin surface, logs | `docs/pilot-approval-review-packet.md` / `docs/security-evidence-tracker.md` | yes | Rejected approvals are tracked as a distinct class in the pilot approval flow. |
| privileged / security-relevant action | runtime events, admin surface, logs | `docs/security-evidence-tracker.md` / `docs/ops-runbook.md` | yes | Privileged actions should be redacted and separately visible in the admin surface. |

## Notes
- Do not mark an event class complete until there is at least one concrete example.
- Link final evidence back to `docs/ops-runbook.md`, `docs/security-evidence-tracker.md`, and `docs/pilot-readiness-gap-checklist.md`.
