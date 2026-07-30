import { Response } from '@cloudflare/workers-types'
import type { D1Database, PagesFunction, R2Bucket } from '@cloudflare/workers-types'
import { CreditAnalysisPlatform, type LaunchScope, type PilotApprovalRecordFile, type PlatformSnapshot } from '../../../../packages/platform/src/index.js'
import { buildPilotAvailabilityPayload, buildPilotOnboardingPayload } from '../../src/pilot-state.js'

export interface PilotPagesEnv {
  PILOT_DB: D1Database
  PILOT_UPLOADS: R2Bucket
}

const SNAPSHOT_KEY = 'platform-snapshot'
const UPLOAD_PREFIX = 'uploads/'

const seedLaunchScope: LaunchScope = {
  mode: 'one-state-free-pilot',
  approvedStates: ['US-CA'],
  provisionalSelectedState: 'US-CA',
  stateSelectionEvidenceReference: 'docs/one-state-launch-selection-memo.md',
  availabilityClaim: 'Pilot currently limited to approved pilot states only.',
  pricingMode: 'free-pilot-only',
  nationwideStatus: 'state-by-state-review',
  notes: 'Cloudflare Pages pilot seed scope for California-only invite review.',
  configuredAt: new Date().toISOString(),
}

const seedApprovalRecord: PilotApprovalRecordFile = {
  scope: 'test-fixture-only',
  status: 'fixture-seed',
  launchScope: {
    mode: seedLaunchScope.mode,
    approvedStates: seedLaunchScope.approvedStates,
    ...(seedLaunchScope.provisionalSelectedState ? { provisionalSelectedState: seedLaunchScope.provisionalSelectedState } : {}),
    stateSelectionEvidenceReference: seedLaunchScope.stateSelectionEvidenceReference,
    availabilityClaim: seedLaunchScope.availabilityClaim,
    pricingMode: seedLaunchScope.pricingMode,
    nationwideStatus: seedLaunchScope.nationwideStatus,
    notes: seedLaunchScope.notes,
  },
  approvals: [],
}

async function readSnapshot(env: PilotPagesEnv): Promise<PlatformSnapshot | null> {
  const row = await env.PILOT_DB.prepare('SELECT value FROM pilot_state WHERE key = ?').bind(SNAPSHOT_KEY).first<{ value: string }>()
  if (!row?.value) return null
  return JSON.parse(row.value) as PlatformSnapshot
}

async function writeSnapshot(env: PilotPagesEnv, snapshot: PlatformSnapshot): Promise<void> {
  await env.PILOT_DB.prepare(
    'INSERT INTO pilot_state (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at',
  ).bind(SNAPSHOT_KEY, JSON.stringify(snapshot), new Date().toISOString()).run()
}

async function ensureSchema(env: PilotPagesEnv): Promise<void> {
  await env.PILOT_DB.exec(`
    CREATE TABLE IF NOT EXISTS pilot_state (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `)
}

async function loadPlatform(env: PilotPagesEnv): Promise<CreditAnalysisPlatform> {
  await ensureSchema(env)
  const platform = new CreditAnalysisPlatform()
  const snapshot = await readSnapshot(env)
  if (snapshot) {
    platform.importSnapshot(snapshot)
    return platform
  }
  const launchScope: LaunchScope = seedLaunchScope
  platform.configureLaunchScope({
    mode: launchScope.mode,
    approvedStates: launchScope.approvedStates,
    ...(launchScope.provisionalSelectedState ? { provisionalSelectedState: launchScope.provisionalSelectedState } : {}),
    stateSelectionEvidenceReference: launchScope.stateSelectionEvidenceReference,
    availabilityClaim: launchScope.availabilityClaim,
    pricingMode: launchScope.pricingMode,
    nationwideStatus: launchScope.nationwideStatus,
    notes: launchScope.notes,
  })
  return platform
}

async function persistPlatform(env: PilotPagesEnv, platform: CreditAnalysisPlatform): Promise<void> {
  await ensureSchema(env)
  await writeSnapshot(env, platform.exportSnapshot())
}

async function storeUploadBlob(env: PilotPagesEnv, uploadId: string, mediaType: string, fileName: string, content: Uint8Array): Promise<void> {
  await env.PILOT_UPLOADS.put(`${UPLOAD_PREFIX}${uploadId}`, content, {
    httpMetadata: { contentType: mediaType },
    customMetadata: { fileName },
  })
}

async function loadUploadBlob(env: PilotPagesEnv, uploadId: string): Promise<Uint8Array | null> {
  const object = await env.PILOT_UPLOADS.get(`${UPLOAD_PREFIX}${uploadId}`)
  if (!object) return null
  return new Uint8Array(await object.arrayBuffer())
}

async function respondWithJson(env: PilotPagesEnv, body: unknown, status = 200): Promise<Response> {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  })
}

export async function withPlatform<T>(env: PilotPagesEnv, mutate: (platform: CreditAnalysisPlatform) => Promise<T> | T): Promise<T> {
  const platform = await loadPlatform(env)
  const result = await mutate(platform)
  await persistPlatform(env, platform)
  return result
}

export async function loadPilotPlatform(env: PilotPagesEnv): Promise<CreditAnalysisPlatform> {
  return loadPlatform(env)
}

export async function persistPilotPlatform(env: PilotPagesEnv, platform: CreditAnalysisPlatform): Promise<void> {
  return persistPlatform(env, platform)
}

export async function persistUpload(env: PilotPagesEnv, uploadId: string, mediaType: string, fileName: string, content: Uint8Array): Promise<void> {
  await storeUploadBlob(env, uploadId, mediaType, fileName, content)
}

export async function fetchUploadContent(env: PilotPagesEnv, uploadId: string): Promise<Uint8Array | null> {
  return loadUploadBlob(env, uploadId)
}

export { respondWithJson, seedApprovalRecord }
