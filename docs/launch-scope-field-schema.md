# Launch-scope field schema (draft)

> **Status:** Proposed schema extension for recording launch-scope decisions in pilot/governance artifacts. This is not an applied data migration yet.

## Purpose
The repo already records human approval areas, but the launch-scope decision now needs explicit fields so the selected pilot scope is visible, auditable, and not implied only by surrounding prose.

## Recommended fields

### Top-level launch scope object
```json
{
  "launchScope": {
    "mode": "one-state-free-pilot",
    "approvedStates": ["CA"],
    "provisionalSelectedState": "CA",
    "stateSelectionEvidenceReference": "docs/one-state-launch-selection-memo.md",
    "availabilityClaim": "Pilot currently limited to approved states only.",
    "pricingMode": "free-pilot-only",
    "nationwideStatus": "not-cleared",
    "notes": "Analysis-only, educational, consumer-uploaded, consumer-only boundary."
  }
}
```

## Field definitions

- `mode`
  - allowed values:
    - `one-state-free-pilot`
    - `small-reviewed-state-subset`
    - `launch-paused-pending-review`

- `approvedStates`
  - array of state abbreviations currently in scope for the pilot
  - for the recommended current posture, expected value is `[`"CA"`]`

- `provisionalSelectedState`
  - single state abbreviation for the primary pilot state when `mode = one-state-free-pilot`

- `stateSelectionEvidenceReference`
  - stable doc reference explaining why the state/scope was chosen

- `availabilityClaim`
  - the exact product-facing claim the business is comfortable making right now

- `pricingMode`
  - expected current value: `free-pilot-only`

- `nationwideStatus`
  - allowed values:
    - `not-cleared`
    - `goal-only`
    - `state-by-state-review`
    - `paused-pending-review`

- `notes`
  - short free-text explanation of the active product boundary

## Approval-record implication
A future real approval record should include both:
1. the seven accountable approval areas, and
2. the chosen launch-scope object above.

That way the repo can distinguish:
- approvals that exist, and
- what exact state scope those approvals apply to.

## Suggested evidence references
- `docs/launch-scope-decision-memo.md`
- `docs/one-state-launch-selection-memo.md`
- `docs/checklist-one-state-free-pilot.md`

## Important note
This schema is a **proposal** for future real records. It should not be used to imply that `docs/pilot-approval-records.json` currently contains real approvals; that file remains a test fixture unless/until accountable humans replace it.
