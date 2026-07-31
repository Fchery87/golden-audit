# Deployment and Release Checklist

## Before release
- Review the Cloudflare setup walkthrough in `docs/cloudflare-pages-d1-r2-setup.md` before creating the real Pages, D1, and R2 resources.
- Use `docs/cloudflare-rollout-checklist.md` as the condensed execution checklist during the actual rollout.
- Confirm the runtime store exists and is writable for the local Node path.
- Confirm the web boundary starts and returns onboarding payloads.
- Confirm the client build succeeds.
- Confirm the smoke check passes.
- Confirm `wrangler.jsonc` placeholders are replaced with the actual `database_id` and `bucket_name` before any Cloudflare deploy.
- Confirm the D1 migration set includes `003_pilot_pages_state.sql` before Pages Functions smoke or deployment.
- Confirm Pages Functions local dev (`wrangler pages dev apps/web/client/dist --d1 PILOT_DB --r2 PILOT_UPLOADS`) can serve `/api/onboarding` and `/api/consumer/health`.
- Confirm the Cloudflare smoke env var (`CF_PAGES_SMOKE_URL`) is set before attempting a remote Pages Functions smoke.
- Record live pilot deployment values:
  - Production alias URL: `https://main.golden-audit-pilot.pages.dev`
  - Verified preview URL: `https://91794dbe.golden-audit-pilot.pages.dev`
  - D1 database: `golden-audit-pilot` (`e24d3d92-0f9d-4cf1-a31f-f47b733e3432`)
  - R2 bucket: `golden-audit-pilot-uploads`
  - Required migration version: `003_pilot_pages_state`
- Record verification evidence from 2026-07-31:
  - `npm run build:web && npm run build` passed
  - `npx wrangler pages deploy apps/web/client/dist --project-name golden-audit-pilot --branch main --commit-dirty --no-bundle` completed successfully
  - `CF_PAGES_SMOKE_URL=https://main.golden-audit-pilot.pages.dev npm run health` returned overall `{"status":"ok"}` with `pagesFunctions.status="ok"` and `database.migrationVersion="003_pilot_pages_state"`

## Release order
1. runtime storage
2. service startup
3. browser smoke
4. observability hooks
5. operator documentation
6. D1 migration apply for `pilot_state`
7. Wrangler local Pages Functions verification
8. Optional remote Pages Functions smoke

## Post-release
- Watch for analysis failures, upload failures, and persistence failures.
- Record any approval changes in the human-gates packet set.
- Keep rollout claims state-bounded until legal review changes the posture.
- Record the actual Cloudflare D1 database id and R2 bucket name in vendor and ops evidence docs.
- Reconfirm live endpoint behavior after each deploy:
  - `/api/onboarding` → `200` JSON
  - `/api/pilot-availability?state=CA` → `200` JSON with `eligible: true`
  - `/api/consumer/health` → `200` JSON
