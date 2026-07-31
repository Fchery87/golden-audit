# Cloudflare Pages, D1, and R2 setup walkthrough

> Status: working instructions for the current California one-state pilot. This is not approval and not production certification.
>
> Verified against Cloudflare docs retrieved on 2026-07-30.

## What this sets up
- **Cloudflare Pages** for hosting
- **Pages Functions** for backend routes
- **D1** for structured pilot state
- **R2** for uploads and large objects

## Prerequisites
- Cloudflare account
- GitHub or GitLab repo access
- Node.js installed
- Wrangler installed through the repo dev dependencies

Run:
```bash
npm install
npx wrangler --version
```

## 1) Create the Cloudflare Pages project
Recommended: **Git integration**.

### Dashboard steps
1. Open **Workers & Pages** in the Cloudflare dashboard.
2. Select **Create application** → **Pages** → **Connect to Git**.
3. Authorize GitHub or GitLab.
4. Select this repository.
5. Set:
   - **Project name**: `golden-audit-pilot` (or your chosen name)
   - **Production branch**: `main`
   - **Build command**:
     ```bash
     npm install && npm run build:web
     ```
   - Note: in this repo, `build:web` installs the nested client dependencies before running the Vite build so Cloudflare Pages can build from the repository root.
   - **Build output directory**:
     ```bash
     apps/web/client/dist
     ```
6. Save and deploy.

Cloudflare Pages docs say the build output directory is what gets deployed, and the repository root is the starting point unless you change the root directory.

## 2) Create the D1 database
Use Wrangler so you get the database id directly.

```bash
npx wrangler d1 create golden-audit-pilot
```

Copy the returned `database_id` into `wrangler.jsonc`.

### Update `wrangler.jsonc`
Set the D1 binding to:
```json
"d1_databases": [
  {
    "binding": "PILOT_DB",
    "database_name": "golden-audit-pilot",
    "database_id": "<REAL_D1_DATABASE_ID>",
    "preview_database_id": "PILOT_DB"
  }
]
```

`preview_database_id` matters for Pages local development.

### Apply the pilot migration
Local first:
```bash
npx wrangler d1 execute golden-audit-pilot --local --file=./database/migrations/003_pilot_pages_state.sql
```

Remote:
```bash
npx wrangler d1 execute golden-audit-pilot --remote --file=./database/migrations/003_pilot_pages_state.sql
```

Verify:
```bash
npx wrangler d1 execute golden-audit-pilot --remote --command="SELECT name FROM sqlite_master WHERE type='table' AND name='pilot_state';"
```

## 3) Create the R2 bucket
Use Wrangler:

```bash
npx wrangler r2 bucket create golden-audit-pilot-uploads
```

Update `wrangler.jsonc`:
```json
"r2_buckets": [
  {
    "binding": "PILOT_UPLOADS",
    "bucket_name": "<REAL_BUCKET_NAME>"
  }
]
```

Verify:
```bash
npx wrangler r2 bucket list
```

## 4) Update `wrangler.jsonc`
Your file should contain:
- `pages_build_output_dir`
- real D1 `database_id`
- real R2 `bucket_name`
- `preview_database_id` for D1 local Pages dev

Example:
```json
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "golden-audit-pilot",
  "compatibility_date": "2026-07-30",
  "pages_build_output_dir": "apps/web/client/dist",
  "observability": {
    "enabled": true,
    "head_sampling_rate": 1
  },
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
  ],
  "vars": {
    "PILOT_APPROVAL_RECORD_PATH": "docs/pilot-approval-records.json",
    "PILOT_SCOPE": "california-one-state-pilot"
  }
}
```

## 5) Run Pages Functions locally
Cloudflare Pages in this repo should discover functions from the top-level `functions/` directory, which re-exports the implementation under `apps/web/functions/`.

Cloudflare Pages docs support local dev via Wrangler.

```bash
npx wrangler pages dev apps/web/client/dist
```

Verify locally:
```bash
curl http://127.0.0.1:8788/api/onboarding
curl http://127.0.0.1:8788/api/pilot-availability?state=CA
curl http://127.0.0.1:8788/api/consumer/health
```

## 6) Deploy the Pages project
If using Git integration:
- commit and push
- Cloudflare will build and deploy automatically

If deploying manually:
```bash
npx wrangler pages deploy apps/web/client/dist
```

## 7) Remote smoke test
After you have a Pages URL:

```bash
CF_PAGES_SMOKE_URL=https://<your-project>.pages.dev npm run health
```

## 8) Files to update in this repo
- `wrangler.jsonc`
- `docs/vendor-inventory-working.md`
- `docs/deployment-checklist.md`
- `database/migrations/003_pilot_pages_state.sql` (only if schema changes)

## Important gotchas
- **Pages config becomes source of truth** once you use `wrangler.jsonc` for project config.
- **Pages local D1** needs `preview_database_id`.
- **R2 bucket names** and **D1 IDs** must be replaced with real values.
- **Local** and **remote** D1 databases are separate.
- Redeploy after changing bindings.

## Recommended next actions
1. create the D1 database
2. create the R2 bucket
3. update `wrangler.jsonc`
4. apply the D1 migration
5. run `wrangler pages dev`
6. deploy the Pages project
