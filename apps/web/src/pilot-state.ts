import type { D1Database, R2Bucket } from '@cloudflare/workers-types'
import type { Jurisdiction, LaunchScope } from '../../../packages/platform/src/index.js'

export interface PilotCloudflareBindings {
  PILOT_DB: D1Database
  PILOT_UPLOADS: R2Bucket
}

export type PilotOnboardingPayload = {
  stepTitle: string
  approvedStates: Jurisdiction[]
  provisionalSelectedState: Jurisdiction | null
  availabilityClaim: string
  statePrompt: string
  continueHelperText: string
  blockedStateMessage: string
  blockedStateFollowUp: string
  boundary: string
  authorizationTransition: string
  fixtureOnly: boolean
}

export function buildPilotOnboardingPayload(scope: LaunchScope | undefined, availabilityClaim: string, fixtureOnly: boolean): PilotOnboardingPayload {
  return {
    stepTitle: 'Pilot availability',
    approvedStates: scope?.approvedStates ?? [],
    provisionalSelectedState: scope?.provisionalSelectedState ?? null,
    availabilityClaim,
    statePrompt: 'Please confirm your state of residence.',
    continueHelperText: 'You can continue only if you currently reside in an approved pilot state.',
    blockedStateMessage: 'This pilot is not currently available in your state.',
    blockedStateFollowUp: 'You may check back later as pilot availability expands.',
    boundary: 'This free pilot provides educational credit-report analysis only — not credit repair, disputes, score guarantees, or legal conclusions.',
    authorizationTransition: 'Before uploading a report, you will be asked to confirm that the report is yours or you are authorized to use it, that you are using this service for personal educational review, and that you understand how your report data will be used, retained, and deleted during this free pilot.',
    fixtureOnly,
  }
}

export function buildPilotAvailabilityPayload(scope: LaunchScope | undefined, fixtureOnly: boolean, stateChecked?: Jurisdiction | null) {
  if (!scope) {
    return {
      status: 'launch-scope-missing' as const,
      eligible: false,
      message: 'Pilot launch scope is not configured.',
    }
  }

  const approvedStates = scope.approvedStates
  const eligible = stateChecked ? approvedStates.includes(stateChecked) : false
  return {
    status: 'ok' as const,
    eligible,
    mode: scope.mode,
    approvedStates,
    provisionalSelectedState: scope.provisionalSelectedState,
    availabilityClaim: fixtureOnly ? 'Pilot currently limited to approved pilot states only.' : scope.availabilityClaim,
    pricingMode: scope.pricingMode,
    nationwideStatus: scope.nationwideStatus,
    fixtureOnly,
    stateChecked: stateChecked ?? null,
    statePrompt: 'Please confirm your state of residence.',
    continueHelperText: 'You can continue only if you currently reside in an approved pilot state.',
    blockedStateMessage: 'This pilot is not currently available in your state.',
    boundary: 'Educational analysis only — not credit repair, disputes, score guarantees, or legal conclusions.',
  }
}
