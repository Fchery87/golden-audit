# 28 — Admin pilot evidence surface

**What to build:** Add an admin/web boundary view for the combined pilot evidence bundle so reviewers can inspect the current status in the running app.

**Blocked by:** 11 — Pilot readiness: security, operations, accessibility, and quality gates.

**Status:** done

## Acceptance criteria

- [x] The admin boundary exposes a pilot evidence page.
- [x] The admin boundary exposes a pilot evidence JSON feed.
- [x] The page shows the evidence summary alongside the existing gate/dashboard surface.
- [x] Tests verify the evidence page and feed respond successfully.
- [x] Existing suite remains green after the seam lands.

## Result

Implemented an admin-facing pilot evidence view in `apps/admin/src/server.ts`.

The admin app now exposes:
- `/pilot-evidence` JSON feed
- inline pilot evidence summary on the dashboard page

Supporting work:
- Added `tests/admin-server.test.ts`.
- Reused the existing platform evidence bundle rather than duplicating summary logic in the admin app.

## Verification

- `npm test -- tests/admin-server.test.ts`
- `npm test`
- `npm run typecheck`

## Notes

- This is a read-only reviewer surface, not an approval engine.
- It makes the current bundle inspectable in a live app while keeping the platform as the source of truth.
