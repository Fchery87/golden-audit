import type { PagesFunction } from '@cloudflare/workers-types'
import { loadPilotRuntime, buildPilotOnboardingPayload, type PilotPagesEnv } from './_platform.js'

/** Direct Pages route kept in lock-step with the catch-all consumer API runtime resolver. */
export const onRequestGet: PagesFunction<PilotPagesEnv> = context => {
  const runtime = loadPilotRuntime(context.env)
  const onboarding = buildPilotOnboardingPayload(runtime.scope, runtime.scope?.availabilityClaim ?? 'Pilot is unavailable for consumer processing.', runtime.fixtureOnly)
  return new globalThis.Response(JSON.stringify({
    service: 'pages-functions',
    onboarding,
    ready: runtime.ready,
    ...(runtime.reason ? { reason: runtime.reason } : {}),
  }), {
    status: 200,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  }) as any
}
