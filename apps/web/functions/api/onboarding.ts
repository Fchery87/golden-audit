import type { PagesFunction } from '@cloudflare/workers-types'
import { Response } from '@cloudflare/workers-types'

export type LaunchScopePayload = {
  approvedStates: string[]
  provisionalSelectedState: string | null
  availabilityClaim: string
  fixtureOnly: boolean
}

const defaultPayload: LaunchScopePayload = {
  approvedStates: ['US-CA'],
  provisionalSelectedState: 'US-CA',
  availabilityClaim: 'Pilot currently limited to approved pilot states only.',
  fixtureOnly: true,
}

export const onRequestGet: PagesFunction = () => {
  return new Response(JSON.stringify({
    service: 'pages-functions',
    onboarding: {
      stepTitle: 'Pilot availability',
      approvedStates: defaultPayload.approvedStates,
      provisionalSelectedState: defaultPayload.provisionalSelectedState,
      availabilityClaim: defaultPayload.availabilityClaim,
      statePrompt: 'Please confirm your state of residence.',
      continueHelperText: 'You can continue only if you currently reside in an approved pilot state.',
      blockedStateMessage: 'This pilot is not currently available in your state.',
      blockedStateFollowUp: 'You may check back later as pilot availability expands.',
      boundary: 'This free pilot provides educational credit-report analysis only — not credit repair, disputes, score guarantees, or legal conclusions.',
      authorizationTransition: 'Before uploading a report, you will be asked to confirm that the report is yours or you are authorized to use it, that you are using this service for personal educational review, and that you understand how your report data will be used, retained, and deleted during this free pilot.',
      fixtureOnly: defaultPayload.fixtureOnly,
    },
  }), {
    status: 200,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  })
}
