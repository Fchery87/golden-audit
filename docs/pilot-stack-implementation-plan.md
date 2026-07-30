# Pilot stack implementation plan

> **Status:** Working implementation plan for the current California one-state pilot. This is not approval and not production certification.

## Chosen stack
- **Hosting:** Cloudflare Pages
- **Backend:** Pages Functions
- **Object storage:** Cloudflare R2
- **Structured app state / database:** Cloudflare D1

## Rationale
- fits the free-tier pilot constraint
- uses the Cloudflare account already available
- keeps the deployment surface small
- aligns with the current data-flow and evidence scaffolding

## Implementation order
1. **Confirm Pages project setup**
   - create/confirm the Pages project
   - verify deploy flow and environment settings
   - replace the `wrangler.jsonc` placeholders with the actual D1 database id and R2 bucket name

2. **Bind Pages Functions**
   - expose the server-side routes needed by the pilot
   - keep the backend inside the Pages project initially
   - verify `/api/onboarding`, `/api/pilot-availability`, and `/api/consumer/health` on Pages Functions

3. **Create D1 database**
   - store account/session, consent, and pilot metadata
   - avoid using D1 for raw file blobs
   - apply `database/migrations/003_pilot_pages_state.sql`

4. **Create R2 bucket**
   - store uploads, exports, and large object files
   - define retention and deletion path

5. **Wire evidence and trackers**
   - update vendor inventory with actual provider names
   - fill observability, secrets, restore, and drill records

6. **Validate pilot readiness docs**
   - keep the checklist aligned with the chosen stack
   - preserve the fail-closed approval posture

## Open decisions
- exact Cloudflare account/resource names
- whether any monitoring provider is needed beyond Cloudflare-native observability
- whether transactional email is needed for the pilot
- whether optional narration stays disabled

## Notes
- This plan does not imply approval.
- It only chooses the provisional pilot stack and order of implementation work.
