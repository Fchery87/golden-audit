import { createServer, type ServerResponse } from 'node:http'
import { readFileSync } from 'node:fs'
import { createHealthStatus } from '../../../packages/domain/src/index.js'
import { CreditAnalysisPlatform, type Jurisdiction, type PilotApprovalRecordFile } from '../../../packages/platform/src/index.js'

const port = Number(process.env.WEB_PORT ?? 3000)
const platform = new CreditAnalysisPlatform()
const approvalRecordPath = process.env.PILOT_APPROVAL_RECORD_PATH ?? 'docs/pilot-approval-records.json'
const approvalRecords = JSON.parse(readFileSync(approvalRecordPath, 'utf8')) as PilotApprovalRecordFile
const hydrated = platform.loadPilotApprovals(approvalRecords)
const launchScope = hydrated.launchScope
const launchScopeAvailabilityClaim = hydrated.fixtureOnly
  ? 'Pilot currently limited to approved pilot states only.'
  : (launchScope?.availabilityClaim ?? 'Pilot launch scope is not configured.')

function respondJson(response: ServerResponse, statusCode: number, body: unknown): void {
  response.writeHead(statusCode, { 'content-type': 'application/json; charset=utf-8' })
  response.end(JSON.stringify(body))
}

function normalizeState(value: string): Jurisdiction {
  return (value.startsWith('US-') ? value : `US-${value}`) as Jurisdiction
}

const server = createServer((request, response) => {
  const url = new URL(request.url ?? '/', `http://${request.headers.host ?? '127.0.0.1'}`)

  if (url.pathname === '/health') {
    respondJson(response, 200, createHealthStatus('web'))
    return
  }

  if (url.pathname === '/pilot-availability') {
    if (!launchScope) {
      respondJson(response, 503, {
        status: 'launch-scope-missing',
        eligible: false,
        message: 'Pilot launch scope is not configured.',
      })
      return
    }

    const state = url.searchParams.get('state')?.trim().toUpperCase()
    const normalizedState = state ? normalizeState(state) : undefined
    const approvedStates = launchScope.approvedStates
    const eligible = normalizedState ? approvedStates.includes(normalizedState) : false
    respondJson(response, 200, {
      status: 'ok',
      eligible,
      mode: launchScope.mode,
      approvedStates,
      provisionalSelectedState: launchScope.provisionalSelectedState,
      availabilityClaim: launchScopeAvailabilityClaim,
      pricingMode: launchScope.pricingMode,
      nationwideStatus: launchScope.nationwideStatus,
      fixtureOnly: hydrated.fixtureOnly,
      stateChecked: normalizedState ?? null,
      statePrompt: 'Please confirm your state of residence.',
      continueHelperText: 'You can continue only if you currently reside in an approved pilot state.',
      blockedStateMessage: 'This pilot is not currently available in your state.',
      boundary: 'Educational analysis only — not credit repair, disputes, score guarantees, or legal conclusions.',
    })
    return
  }

  respondJson(response, 200, {
    service: 'web',
    onboarding: {
      stepTitle: 'Pilot availability',
      approvedStates: launchScope?.approvedStates ?? [],
      provisionalSelectedState: launchScope?.provisionalSelectedState ?? null,
      availabilityClaim: launchScopeAvailabilityClaim,
      statePrompt: 'Please confirm your state of residence.',
      continueHelperText: 'You can continue only if you currently reside in an approved pilot state.',
      blockedStateMessage: 'This pilot is not currently available in your state.',
      blockedStateFollowUp: 'You may check back later as pilot availability expands.',
      boundary: 'This free pilot provides educational credit-report analysis only — not credit repair, disputes, score guarantees, or legal conclusions.',
      authorizationTransition: 'Before uploading a report, you will be asked to confirm that the report is yours or you are authorized to use it, that you are using this service for personal educational review, and that you understand how your report data will be used, retained, and deleted during this free pilot.',
      fixtureOnly: hydrated.fixtureOnly,
    },
  })
})

server.listen(port, () => console.log(`web listening on ${port}`))
