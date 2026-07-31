# Observability, Secrets, Backups, and Runbooks

> **Status:** Operational scaffolding for the current California one-state pilot. These notes support readiness evidence; they do not constitute production certification.

## Observability
- Log every consumer mutation with a structured event.
- Include request/session IDs on all web-boundary errors when practical.
- Track analysis failures, upload failures, persistence failures, and rejected approvals as separate event classes.
- Web runtime events are persisted in the runtime SQLite store.
- Cloudflare Pages Functions pilot endpoints verified on 2026-07-31 at `https://main.golden-audit-pilot.pages.dev`.
- For pilot evidence, record at least one example of each event class and where it is surfaced.

## Secrets
- Keep future production secrets out of git.
- Use environment variables or a secret manager for database credentials, signing keys, and provider tokens.
- Never hardcode credentials in `apps/web`, `apps/worker`, or `apps/admin`.
- Current Cloudflare pilot resources in use:
  - Pages alias URL: `https://main.golden-audit-pilot.pages.dev`
  - Verified preview URL: `https://91794dbe.golden-audit-pilot.pages.dev`
  - D1 database: `golden-audit-pilot` (`e24d3d92-0f9d-4cf1-a31f-f47b733e3432`)
  - R2 bucket: `golden-audit-pilot-uploads`
- For pilot evidence, document where secrets live and how access is restricted.

## Backups
- Treat runtime storage as a backup target once it moves off local disk.
- Define restore steps before any real pilot expansion.
- Test restore paths on a schedule.
- Current Cloudflare persistence footprint for the pilot:
  - D1 migration version verified remotely: `003_pilot_pages_state`
  - D1 `pilot_state` table confirmed present on 2026-07-31
  - R2 upload bucket configured as `golden-audit-pilot-uploads`
- For pilot evidence, record the backup target, restore steps, and last restore test result.

## Runbooks
### Health failure
1. Check boundary process status.
2. Check runtime storage path availability.
3. Review latest structured logs and runtime events.
4. Re-run the smoke check.
5. For Pages Functions incidents, verify:
   - `GET https://main.golden-audit-pilot.pages.dev/api/onboarding`
   - `GET https://main.golden-audit-pilot.pages.dev/api/pilot-availability?state=CA`
   - `GET https://main.golden-audit-pilot.pages.dev/api/consumer/health`
   - `CF_PAGES_SMOKE_URL=https://main.golden-audit-pilot.pages.dev npm run health`

### Analysis failure
1. Confirm the upload is authorized and intact.
2. Confirm the parser can read the report format.
3. Inspect the match-review flow for unresolved collisions.
4. Check the rule publication and jurisdiction gate.

### Persistence failure
1. Confirm the persistence directory exists and is writable.
2. Confirm the SQLite runtime file is present.
3. Inspect recent `runtime_events` records.
4. Restore from the latest backup if available.
5. For Cloudflare pilot persistence failures, verify:
   - D1 database `golden-audit-pilot` (`e24d3d92-0f9d-4cf1-a31f-f47b733e3432`)
   - remote migration `003_pilot_pages_state`
   - `pilot_state` table presence via `wrangler d1 execute ... --command="SELECT name FROM sqlite_master WHERE type='table' AND name='pilot_state';"`

### Drill evidence
- Record date, owner, result, gaps, and follow-up ticket for each exercised runbook.
- Keep the exercise note linked to the corresponding approval lane.

## Release note
These notes are operational scaffolding only. They do not constitute production certification.

Latest verified pilot deploy evidence (2026-07-31):
- `npm run build:web && npm run build` passed
- `npx wrangler pages deploy apps/web/client/dist --project-name golden-audit-pilot --branch main --commit-dirty --no-bundle` succeeded
- `CF_PAGES_SMOKE_URL=https://main.golden-audit-pilot.pages.dev npm run health` returned overall `{"status":"ok"}`
