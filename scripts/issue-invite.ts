// D10: registration is invite-only. This mints a single-use code directly against the local
// Node dev SQLite store (the same runtime.sqlite apps/web/src/server.ts reads/writes), so a
// developer/tester can register through the running dev server or the /debug wizard.
//
// No public HTTP endpoint issues invites — that would defeat the point of invite-only. This is
// the operator-facing path, out-of-band by design (docs/consumer-workflow-implementation-plan.md D10).
//
// Usage: npm run issue-invite
// Deployed-target (Cloudflare D1) invite issuance is a documented follow-up, not built here —
// see docs/deployment-checklist.md.

import { resolveRuntimeDbPath, SqlitePlatformStore } from '../apps/web/src/runtime-store.js'
import { randomInviteCode } from '../packages/platform/src/index.js'

const runtimeDir = process.env.PILOT_PERSISTENCE_DIR ?? '.scratch/runtime/web'
const store = new SqlitePlatformStore(resolveRuntimeDbPath(runtimeDir))
const code = randomInviteCode()
await store.createInvite(code, new Date().toISOString())
store.close()

console.log(`Invite code: ${code}`)
