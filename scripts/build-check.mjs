import { access, mkdir, writeFile } from 'node:fs/promises'

const required = [
  'apps/web/src/server.ts',
  'apps/web/functions/api/health.ts',
  'apps/web/functions/api/onboarding.ts',
  'apps/web/functions/api/_platform.ts',
  'apps/web/functions/api/consumer/[[path]].ts',
  'apps/web/src/pilot-state.ts',
  'functions/api/health.ts',
  'functions/api/onboarding.ts',
  'functions/api/[[path]].ts',
  'apps/worker/src/server.ts',
  'apps/admin/src/server.ts',
  'packages/domain/src/index.ts',
  'packages/validation/src/index.ts',
  'packages/platform/src/index.ts',
  'database/migrations/001_foundation.sql',
  'database/migrations/002_product_platform.sql',
  'database/migrations/003_pilot_pages_state.sql',
  'wrangler.jsonc',
]
await Promise.all(required.map(path => access(path)))
await mkdir('dist', { recursive: true })
await writeFile('dist/build-manifest.json', `${JSON.stringify({ version: '0.1.0', boundaries: required, builtAt: new Date().toISOString() }, null, 2)}\n`)
console.log(`Build manifest created for ${required.length} deployable boundaries and migrations`)
