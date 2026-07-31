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
