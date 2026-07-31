# Cloudflare rollout checklist

> **Status:** Working rollout checklist for the current California one-state pilot. This is not approval and not production certification.

## Purpose
Use this as the single operational checklist for standing up the pilot Cloudflare stack:
- Cloudflare Pages
- Pages Functions
- D1
- R2

For the full walkthrough, see `docs/cloudflare-pages-d1-r2-setup.md`.
For the condensed execution checklist, see `docs/cloudflare-rollout-checklist.md`.

## Repo-specific command block
Run these commands in this repo, in this order.

### 1. Verify local baseline
```bash
npm install
npx wrangler --version
npm run typecheck
npm test
npm run build
```

### 2. Create the D1 database
```bash
npx wrangler d1 create golden-audit-pilot
```

Then update `wrangler.jsonc` with the returned `database_id` and ensure:
```json
"preview_database_id": "PILOT_DB"
```

### 3. Create the R2 bucket
```bash
npx wrangler r2 bucket create golden-audit-pilot-uploads
npx wrangler r2 bucket list
```

Then update `wrangler.jsonc` with the real R2 `bucket_name`.

### 4. Apply the D1 migration locally and remotely
```bash
npx wrangler d1 execute golden-audit-pilot --local --file=./database/migrations/003_pilot_pages_state.sql
npx wrangler d1 execute golden-audit-pilot --remote --file=./database/migrations/003_pilot_pages_state.sql
npx wrangler d1 execute golden-audit-pilot --remote --command="SELECT name FROM sqlite_master WHERE type='table' AND name='pilot_state';"
```

### 5. Re-verify repo health after config edits
```bash
npm run typecheck
npm test
npm run build
```

### 6. Run local Pages Functions dev
```bash
npx wrangler pages dev apps/web/client/dist
```

In another terminal, verify:
```bash
curl http://127.0.0.1:8788/api/onboarding
curl http://127.0.0.1:8788/api/pilot-availability?state=CA
curl http://127.0.0.1:8788/api/consumer/health
```

### 7. After the Pages project is deployed, run remote smoke
```bash
CF_PAGES_SMOKE_URL=https://<your-project>.pages.dev npm run health
```

### 8. Update working docs with real values
Update:
- `wrangler.jsonc`
- `docs/vendor-inventory-working.md`
- `docs/deployment-checklist.md`
- `docs/ops-runbook.md` if you are capturing operator-facing details

## Inputs you need before starting
- Cloudflare account access
- GitHub or GitLab repo access
- local repo checked out
- Node + npm working locally
- permission to create Pages, D1, and R2 resources in the target Cloudflare account

## Repo files to update during rollout
- `wrangler.jsonc`
- `docs/vendor-inventory-working.md`
- `docs/deployment-checklist.md`
- `docs/ops-runbook.md` (if you are recording actual operator values)

## Step 1 — install dependencies and verify local baseline
Run:
```bash
npm install
npx wrangler --version
npm run typecheck
npm test
npm run build
```

Success criteria:
- local checks pass before Cloudflare-specific changes
- Wrangler is available locally

## Step 2 — create the D1 database
Run:
```bash
npx wrangler d1 create golden-audit-pilot
```

Capture:
- D1 database name
- D1 database id

Update:
- `wrangler.jsonc`
  - replace `REPLACE_WITH_D1_DATABASE_ID`
  - add or confirm:
    ```json
    "preview_database_id": "PILOT_DB"
    ```

Success criteria:
- a real D1 database exists
- `wrangler.jsonc` contains the real D1 id

## Step 3 — create the R2 bucket
Run:
```bash
npx wrangler r2 bucket create golden-audit-pilot-uploads
```

Capture:
- R2 bucket name

Update:
- `wrangler.jsonc`
  - replace `REPLACE_WITH_R2_BUCKET_NAME`

Verify:
```bash
npx wrangler r2 bucket list
```

Success criteria:
- the bucket exists
- `wrangler.jsonc` contains the real bucket name

## Step 4 — apply the pilot D1 schema
This repo uses:
- `database/migrations/003_pilot_pages_state.sql`

Apply locally:
```bash
npx wrangler d1 execute golden-audit-pilot --local --file=./database/migrations/003_pilot_pages_state.sql
```

Apply remotely:
```bash
npx wrangler d1 execute golden-audit-pilot --remote --file=./database/migrations/003_pilot_pages_state.sql
```

Verify remotely:
```bash
npx wrangler d1 execute golden-audit-pilot --remote --command="SELECT name FROM sqlite_master WHERE type='table' AND name='pilot_state';"
```

Success criteria:
- `pilot_state` exists remotely
- local and remote migration runs succeed

## Step 5 — verify Wrangler config is complete
Your `wrangler.jsonc` should have all of the following:
- `name`
- `compatibility_date`
- `pages_build_output_dir`
- D1 binding with real `database_id`
- D1 `preview_database_id`
- R2 binding with real `bucket_name`
- pilot vars

Minimum expected shape:
```json
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "golden-audit-pilot",
  "compatibility_date": "2026-07-30",
  "pages_build_output_dir": "apps/web/client/dist",
  "d1_databases": [
    {
      "binding": "PILOT_DB",
      "database_name": "golden-audit-pilot",
      "database_id": "<REAL_D1_DATABASE_ID>",
      "preview_database_id": "PILOT_DB"
    }
  ],
  "r2_buckets": [
    {
      "binding": "PILOT_UPLOADS",
      "bucket_name": "<REAL_BUCKET_NAME>"
    }
  ]
}
```

Success criteria:
- no placeholder values remain

## Step 6 — run local Pages Functions dev
Cloudflare Pages in this repo should discover functions from the top-level `functions/` directory, which re-exports the implementation under `apps/web/functions/`.

Run:
```bash
npx wrangler pages dev apps/web/client/dist
```

Verify locally:
```bash
curl http://127.0.0.1:8788/api/onboarding
curl http://127.0.0.1:8788/api/pilot-availability?state=CA
curl http://127.0.0.1:8788/api/consumer/health
```

Success criteria:
- onboarding returns approved-state payload
- pilot availability route responds
- consumer health responds

## Step 7 — create the Pages project in Cloudflare dashboard
Dashboard path:
- **Workers & Pages**
- **Create application**
- **Pages**
- **Connect to Git**

Set:
- **Project name**: `golden-audit-pilot` or your chosen production-safe name
- **Production branch**: `main`
- **Build command**:
  ```bash
  npm install && npm run build:web
  ```
  (`build:web` installs the nested client dependencies before running the Vite build.)
- **Build output directory**:
  ```bash
  apps/web/client/dist
  ```

Success criteria:
- project is created
- initial deploy succeeds
- a `.pages.dev` URL exists

## Step 8 — verify deployed Pages Functions routes
Once deployed, test:
```bash
curl https://<your-project>.pages.dev/api/onboarding
curl https://<your-project>.pages.dev/api/pilot-availability?state=CA
curl https://<your-project>.pages.dev/api/consumer/health
```

Optional smoke using the repo script:
```bash
CF_PAGES_SMOKE_URL=https://<your-project>.pages.dev npm run health
```

Success criteria:
- deployed routes respond successfully
- remote smoke passes if configured

## Step 9 — update working evidence docs
Update at minimum:
- `docs/vendor-inventory-working.md`
  - actual D1 database reference
  - actual R2 bucket name
  - Pages project reference
- `docs/deployment-checklist.md`
  - mark actual rollout steps completed
- `docs/ops-runbook.md`
  - add the real Pages URL, D1 name/id reference, and R2 bucket name if you are operationalizing the pilot

Success criteria:
- docs no longer rely on placeholders for created resources

## Human signoff artifacts to capture
Record these values somewhere durable:
- Cloudflare account used
- Pages project name
- production Pages URL
- D1 database name
- D1 database id
- R2 bucket name
- date migration applied
- operator who performed setup

Recommended working docs:
- `docs/vendor-inventory-working.md`
- `docs/ops-runbook.md`
- `docs/observability-evidence-working.md`
- `docs/security-evidence-tracker.md`

## Gotchas
- `wrangler.jsonc` becomes the practical source of truth for the Pages project config you are deploying.
- Pages local development with D1 needs `preview_database_id`.
- local D1 and remote D1 are separate.
- changing bindings may require redeploying the Pages project.
- this rollout does **not** equal legal, privacy, security, or production approval.

## Completion check
You are done with the rollout when all of the following are true:
- `wrangler.jsonc` has no placeholder D1 or R2 values
- D1 exists and `pilot_state` is present remotely
- R2 bucket exists
- local Pages dev works
- Pages deploy works
- `/api/onboarding` and `/api/consumer/health` work remotely
- working docs contain the real Cloudflare resource references
