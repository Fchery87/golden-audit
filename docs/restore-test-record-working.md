# Restore test record (working)

> **Status:** Working record for the current California one-state pilot. This is not approval and not production certification. No restore test has been executed yet; this file exists to capture the first accountable test.

## Restore test
- **Date:** `2026-07-31`
- **Owner:** `Ops / Security`
- **Backup target:** `Cloudflare D1 + R2`
- **Restore objective:** Restore the pilot runtime state and confirm the expected scope can be recovered without widening access.
- **Result:** `pending first restore drill`
- **Evidence reference:** `docs/ops-runbook.md` / `docs/deployment-checklist.md`
- **Gaps found:** `not yet exercised`
- **Follow-up ticket:** `TBD`

## Preconditions to execute
- backup target chosen
- restore steps documented
- sensitive-data handling constraints agreed
- owner assigned

## Notes
- Do not mark this as passed until the restore has been exercised against the actual pilot architecture.
- Link the final result back to `docs/security-evidence-tracker.md` and `docs/pilot-readiness-gap-checklist.md`.
