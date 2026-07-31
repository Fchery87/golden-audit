import type { D1Database, R2Bucket, RateLimit } from '@cloudflare/workers-types'
import { CreditAnalysisPlatform, type LaunchScope, type PilotApprovalRecordFile, type BlobStore, type Id } from '../../../../packages/platform/src/index.js'
import { buildPilotAvailabilityPayload, buildPilotOnboardingPayload } from '../../src/pilot-state.js'
import { bootstrapGovernance } from '../../src/pilot-bootstrap.js'
import { D1PlatformStore } from './store-d1.js'

export interface PilotPagesEnv {
  PILOT_DB: D1Database
  PILOT_UPLOADS: R2Bucket
  /** D10: register/sign-in/password-reset rate limiting, keyed by client IP. */
  AUTH_RATE_LIMITER: RateLimit
}

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

/**
 * Each call builds a fresh CreditAnalysisPlatform bound to this request's D1/R2 bindings.
 * There is no whole-platform snapshot to load/save any more (D5): every entity method reads
 * and writes directly through the injected store, so "loading" a platform is just constructing
 * it plus re-seeding the in-memory operator config (launch scope + governance/rulesets) that
 * doesn't live in the store at all — see packages/platform/src/store.ts's doc comment for why.
 */
export function loadPilotPlatform(env: PilotPagesEnv): CreditAnalysisPlatform {
  const platform = new CreditAnalysisPlatform(new D1PlatformStore(env.PILOT_DB), new R2BlobStore(env.PILOT_UPLOADS))
  platform.configureLaunchScope({
    mode: seedLaunchScope.mode,
    approvedStates: seedLaunchScope.approvedStates,
    ...(seedLaunchScope.provisionalSelectedState ? { provisionalSelectedState: seedLaunchScope.provisionalSelectedState } : {}),
    stateSelectionEvidenceReference: seedLaunchScope.stateSelectionEvidenceReference,
    availabilityClaim: seedLaunchScope.availabilityClaim,
    pricingMode: seedLaunchScope.pricingMode,
    nationwideStatus: seedLaunchScope.nationwideStatus,
    notes: seedLaunchScope.notes,
  })
  bootstrapGovernance(platform, 'US-CA')
  return platform
}

export { buildPilotAvailabilityPayload, buildPilotOnboardingPayload, seedApprovalRecord }
