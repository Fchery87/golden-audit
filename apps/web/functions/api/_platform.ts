import type { D1Database, R2Bucket, RateLimit } from '@cloudflare/workers-types'
import { CreditAnalysisPlatform, type LaunchScope, type PilotApprovalArea, type PilotApprovalRecordFile, type BlobStore, type Id } from '../../../../packages/platform/src/index.js'
import { createConsumerEmailSender, type ConsumerEmailTransport } from '../../src/consumer-email.js'
import { buildPilotAvailabilityPayload, buildPilotOnboardingPayload } from '../../src/pilot-state.js'
import { bootstrapGovernance } from '../../src/pilot-bootstrap.js'
import { D1PlatformStore } from './store-d1.js'

export interface PilotPagesEnv {
  PILOT_DB: D1Database
  PILOT_UPLOADS: R2Bucket
  /** D10: register/sign-in/password-reset rate limiting, keyed by client IP. */
  AUTH_RATE_LIMITER: RateLimit
  /** Cloudflare Email Sending binding; configured in wrangler.jsonc. */
  EMAIL: { send(message: { to: string; from: string; subject: string; text: string; html: string }): Promise<void> }
  /** HTTPS origin of the consumer app, e.g. https://pilot.example.com/app. */
  CONSUMER_APP_URL: string
  /** Verified Cloudflare Email Sending sender address. */
  CONSUMER_EMAIL_FROM: string
  /** Server-only owner address used to authorize the dashboard; never return it to the client. */
  GOLDEN_AUDIT_OWNER_EMAIL?: string
  /** Fixture mode may expose diagnostics only. Real-consumer mode additionally requires a valid approval record JSON. */
  PILOT_RUNTIME_MODE?: 'fixture' | 'real-consumer'
  /** Versioned, non-secret launch scope + accountable approval evidence for Pages Functions. Never use a local filesystem path. */
  PILOT_APPROVAL_RECORD_JSON?: string
}

export function loadConsumerEmailSender(env: PilotPagesEnv) {
  return createConsumerEmailSender({
    appBaseUrl: env.CONSUMER_APP_URL,
    from: env.CONSUMER_EMAIL_FROM,
    transport: env.EMAIL as ConsumerEmailTransport,
  })
}

const UPLOAD_PREFIX = 'uploads/'
const REQUIRED_APPROVAL_AREAS: PilotApprovalArea[] = ['product', 'legal', 'privacy', 'security', 'operations', 'accessibility', 'vendor']
const LAUNCH_SCOPE_MODES = new Set(['one-state-free-pilot', 'small-reviewed-state-subset', 'launch-paused-pending-review'])
const NATIONWIDE_STATUSES = new Set(['not-cleared', 'goal-only', 'state-by-state-review', 'paused-pending-review'])

const seedLaunchScope: LaunchScope = {
  mode: 'one-state-free-pilot',
  approvedStates: ['US-CA'],
  provisionalSelectedState: 'US-CA',
  stateSelectionEvidenceReference: 'docs/one-state-launch-selection-memo.md',
  availabilityClaim: 'Pilot currently limited to approved pilot states only.',
  pricingMode: 'free-pilot-only',
  nationwideStatus: 'state-by-state-review',
  notes: 'Cloudflare Pages fixture-only scope. It cannot authorize consumer processing.',
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

type RuntimeConfiguration =
  | { kind: 'fixture'; scope: LaunchScope; approvalRecord: PilotApprovalRecordFile }
  | { kind: 'real-consumer'; approvalRecord: PilotApprovalRecordFile }
  | { kind: 'invalid'; reason: string }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
function hasNonBlankString(record: Record<string, unknown>, key: string): boolean {
  return typeof record[key] === 'string' && record[key].trim().length > 0
}
function isApprovalArea(value: unknown): value is PilotApprovalArea {
  return typeof value === 'string' && REQUIRED_APPROVAL_AREAS.includes(value as PilotApprovalArea)
}
function isLaunchScopeRecord(value: unknown): value is NonNullable<PilotApprovalRecordFile['launchScope']> {
  if (!isRecord(value)) return false
  const mode = value.mode
  const approvedStates = value.approvedStates
  const stateSelectionEvidenceReference = value.stateSelectionEvidenceReference
  const availabilityClaim = value.availabilityClaim
  const nationwideStatus = value.nationwideStatus
  const notes = value.notes
  if (typeof mode !== 'string' || !LAUNCH_SCOPE_MODES.has(mode) || !Array.isArray(approvedStates) || approvedStates.length === 0 || typeof stateSelectionEvidenceReference !== 'string' || stateSelectionEvidenceReference.trim().length === 0 || typeof availabilityClaim !== 'string' || availabilityClaim.trim().length === 0 || value.pricingMode !== 'free-pilot-only' || typeof nationwideStatus !== 'string' || !NATIONWIDE_STATUSES.has(nationwideStatus) || typeof notes !== 'string' || notes.trim().length === 0) return false
  for (const state of approvedStates) if (typeof state !== 'string' || !/^US-[A-Z]{2}$/.test(state)) return false
  return value.provisionalSelectedState === undefined || (typeof value.provisionalSelectedState === 'string' && /^US-[A-Z]{2}$/.test(value.provisionalSelectedState))
}
function isApprovalRecord(value: unknown): value is PilotApprovalRecordFile {
  if (!isRecord(value) || !hasNonBlankString(value, 'scope') || !hasNonBlankString(value, 'status') || !isLaunchScopeRecord(value.launchScope) || !Array.isArray(value.approvals)) return false
  return value.approvals.every(approval => isRecord(approval) && isApprovalArea(approval.area) && hasNonBlankString(approval, 'approver') && hasNonBlankString(approval, 'evidenceReference'))
}

/** Parses the Pages-safe deploy-time contract. A filesystem path is intentionally not a supported input. */
export function resolvePilotRuntimeConfiguration(env: Pick<PilotPagesEnv, 'PILOT_RUNTIME_MODE' | 'PILOT_APPROVAL_RECORD_JSON'>): RuntimeConfiguration {
  if ((env.PILOT_RUNTIME_MODE ?? 'fixture') === 'fixture') return { kind: 'fixture', scope: seedLaunchScope, approvalRecord: seedApprovalRecord }
  if (env.PILOT_RUNTIME_MODE !== 'real-consumer') return { kind: 'invalid', reason: 'Pilot runtime mode is invalid' }
  if (!env.PILOT_APPROVAL_RECORD_JSON?.trim()) return { kind: 'invalid', reason: 'Pilot approval record is not configured' }
  let parsed: unknown
  try { parsed = JSON.parse(env.PILOT_APPROVAL_RECORD_JSON) } catch { return { kind: 'invalid', reason: 'Pilot approval record is invalid' } }
  if (!isApprovalRecord(parsed)) return { kind: 'invalid', reason: 'Pilot approval record is invalid' }
  if (parsed.scope === 'test-fixture-only' || /fixture/i.test(parsed.status) || /not approvals?/i.test(parsed._warning ?? '')) return { kind: 'invalid', reason: 'Fixture approval data cannot enable consumer processing' }
  const uniqueAreas = new Set(parsed.approvals.map(approval => approval.area))
  if (REQUIRED_APPROVAL_AREAS.some(area => !uniqueAreas.has(area))) return { kind: 'invalid', reason: 'Pilot approval record is incomplete' }
  return { kind: 'real-consumer', approvalRecord: parsed }
}

/** Raw upload bytes live in R2 only — never in D1 (docs/consumer-workflow-implementation-plan.md D5). */
class R2BlobStore implements BlobStore {
  constructor(private bucket: R2Bucket) {}
  async get(id: Id): Promise<Uint8Array | undefined> {
    const object = await this.bucket.get(`${UPLOAD_PREFIX}${id}`)
    if (!object) return undefined
    return new Uint8Array(await object.arrayBuffer())
  }
  async put(id: Id, bytes: Uint8Array): Promise<void> {
    await this.bucket.put(`${UPLOAD_PREFIX}${id}`, bytes)
  }
  async delete(id: Id): Promise<void> {
    await this.bucket.delete(`${UPLOAD_PREFIX}${id}`)
  }
}

export type PilotPagesRuntime = {
  platform?: CreditAnalysisPlatform
  fixtureOnly: boolean
  ready: boolean
  scope?: LaunchScope
  reason?: string
}

/** Resolves one configuration source for Pages diagnostics and consumer-route authorization. */
export function loadPilotRuntime(env: PilotPagesEnv): PilotPagesRuntime {
  const configuration = resolvePilotRuntimeConfiguration(env)
  if (configuration.kind === 'invalid') return { fixtureOnly: false, ready: false, reason: configuration.reason }
  if (configuration.kind === 'fixture') return { fixtureOnly: true, ready: false, scope: configuration.scope, reason: 'Fixture runtime cannot process consumer data' }
  const platform = new CreditAnalysisPlatform(new D1PlatformStore(env.PILOT_DB), new R2BlobStore(env.PILOT_UPLOADS), undefined, env.GOLDEN_AUDIT_OWNER_EMAIL)
  platform.loadPilotApprovals(configuration.approvalRecord)
  bootstrapGovernance(platform, 'US-CA')
  try {
    platform.assertRealConsumerPilotReady()
    return { platform, fixtureOnly: false, ready: true, scope: platform.getLaunchScope() }
  } catch {
    return { platform, fixtureOnly: false, ready: false, scope: platform.getLaunchScope(), reason: 'Pilot approval gate is incomplete' }
  }
}

/**
 * Each call builds a fresh CreditAnalysisPlatform bound to this request's D1/R2 bindings.
 * Consumer-capable callers must use only a runtime that passed the configured approval gate.
 */
export function loadPilotPlatform(env: PilotPagesEnv): CreditAnalysisPlatform {
  const runtime = loadPilotRuntime(env)
  if (!runtime.ready || !runtime.platform) throw new Error('Pilot is unavailable for consumer processing')
  return runtime.platform
}

export { buildPilotAvailabilityPayload, buildPilotOnboardingPayload, seedApprovalRecord }
