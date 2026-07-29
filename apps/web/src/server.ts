import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { readFileSync } from 'node:fs'
import { createHealthStatus } from '../../../packages/domain/src/index.js'
import {
  CreditAnalysisPlatform,
  type Jurisdiction,
  type PilotApprovalRecordFile,
  type LaunchScope,
  type MatchGroup,
} from '../../../packages/platform/src/index.js'

const port = Number(process.env.WEB_PORT ?? 3000)
const platform = new CreditAnalysisPlatform()
const approvalRecordPath = process.env.PILOT_APPROVAL_RECORD_PATH ?? 'docs/pilot-approval-records.json'
const approvalRecords = JSON.parse(readFileSync(approvalRecordPath, 'utf8')) as PilotApprovalRecordFile
const hydrated = platform.loadPilotApprovals(approvalRecords)
const launchScope = hydrated.launchScope
const launchScopeAvailabilityClaim = hydrated.fixtureOnly
  ? 'Pilot currently limited to approved pilot states only.'
  : (launchScope?.availabilityClaim ?? 'Pilot launch scope is not configured.')
const publishedRulesetByJurisdiction = bootstrapPublishedRulesets(platform)

type JsonRecord = Record<string, unknown>
type ConsumerSessionHeader = { sessionId: string }
type ConsumerRegisterBody = { email: string; password: string }
type ConsumerConsentBody = {
  version: string
  adultUSConsumer: true
  authorizedReportUse: true
  educationalLimitations: true
  sensitiveDataHandling: true
  residence: string
  analysisJurisdiction: string
}
type UploadInitBody = { workspaceId: string }
type UploadCompleteBody = { uploadId: string; token: string; fileName: string; mediaType: string; contentBase64: string }
type AnalysisKickoffBody = { jurisdiction?: string; autoConfirmSimpleMatches?: boolean }
type MatchDecisionBody = { action: 'confirmed' | 'rejected' | 'split' | 'merged'; reason: string }

type ConsumerFlowSummary = {
  status: 'analysis-complete' | 'match-review-required'
  reportId: string
  matches: MatchGroup[]
  analysisId?: string
  consumerReportId?: string
  exportId?: string
}

function bootstrapPublishedRulesets(app: CreditAnalysisPlatform): Partial<Record<Jurisdiction, string>> {
  app.registerReviewer({ id: 'web-compliance-reviewer', role: 'compliance-reviewer' })
  app.registerReviewer({ id: 'web-engineering-reviewer', role: 'engineering-reviewer' })
  app.registerReviewer({ id: 'web-release-manager', role: 'release-manager' })

  const authority = app.createAuthority('web-compliance-reviewer', {
    citation: '15 USC 1681',
    jurisdiction: 'US-CA',
    effectiveFrom: '2020-01-01',
    permittedUse: 'education',
    limitations: ['A consumer report alone may not establish a legal violation'],
  })
  const module = app.createEducationModule('web-compliance-reviewer', {
    title: 'Balance timing',
    body: 'Bureaus can update on different dates.',
    jurisdiction: 'US-CA',
    effectiveFrom: '2020-01-01',
    permittedUse: 'education',
    limitations: ['Verify current information directly'],
  })
  app.reviewGovernance('authority', authority.id, 'web-compliance-reviewer', 'approved', 'Prototype consumer flow seed content')
  app.reviewGovernance('module', module.id, 'web-compliance-reviewer', 'approved', 'Prototype consumer flow seed content')
  const rule = app.createRule('web-engineering-reviewer', {
    name: 'cross-bureau-balance-difference',
    jurisdiction: 'US-CA',
    effectiveFrom: '2020-01-01',
    requiredInputs: ['balance', 'updated'],
    minimumConfidence: 0.9,
    classification: 'verification-recommended',
    limitations: ['Different update dates can explain a difference'],
    authorityIds: [authority.id],
    educationModuleIds: [module.id],
    testCases: ['web-consumer-flow'],
  })
  app.reviewGovernance('rule', rule.id, 'web-engineering-reviewer', 'approved', 'Prototype consumer flow seed content')

  return {
    'US-CA': app.publishRuleset('web-release-manager', 'US-CA', '2026-07-01'),
  }
}

function respondJson(response: ServerResponse, statusCode: number, body: unknown): void {
  response.writeHead(statusCode, { 'content-type': 'application/json; charset=utf-8' })
  response.end(JSON.stringify(body))
}

function normalizeState(value: string): Jurisdiction {
  return (value.startsWith('US-') ? value : `US-${value}`) as Jurisdiction
}

function getSessionId(request: IncomingMessage): string {
  const value = request.headers['x-session-id']
  if (!value || Array.isArray(value) || !value.trim()) throw new Error('x-session-id header is required')
  return value
}

async function readJsonBody(request: IncomingMessage): Promise<JsonRecord> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += buffer.length
    if (size > 8_000_000) throw new Error('Request body exceeds limits')
    chunks.push(buffer)
  }
  if (chunks.length === 0) return {}
  const text = Buffer.concat(chunks).toString('utf8')
  const parsed: unknown = JSON.parse(text)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('JSON body must be an object')
  return parsed as JsonRecord
}

function onboardingPayload(scope: LaunchScope | undefined): JsonRecord {
  return {
    stepTitle: 'Pilot availability',
    approvedStates: scope?.approvedStates ?? [],
    provisionalSelectedState: scope?.provisionalSelectedState ?? null,
    availabilityClaim: launchScopeAvailabilityClaim,
    statePrompt: 'Please confirm your state of residence.',
    continueHelperText: 'You can continue only if you currently reside in an approved pilot state.',
    blockedStateMessage: 'This pilot is not currently available in your state.',
    blockedStateFollowUp: 'You may check back later as pilot availability expands.',
    boundary: 'This free pilot provides educational credit-report analysis only — not credit repair, disputes, score guarantees, or legal conclusions.',
    authorizationTransition: 'Before uploading a report, you will be asked to confirm that the report is yours or you are authorized to use it, that you are using this service for personal educational review, and that you understand how your report data will be used, retained, and deleted during this free pilot.',
    fixtureOnly: hydrated.fixtureOnly,
  }
}

function resolveRulesetForJurisdiction(jurisdiction: Jurisdiction): string {
  const ruleset = publishedRulesetByJurisdiction[jurisdiction]
  if (!ruleset) throw new Error(`No published ruleset is available for ${jurisdiction}`)
  return ruleset
}

function maybeAutoConfirmSimpleMatches(sessionId: string, matches: MatchGroup[]): MatchGroup[] {
  const confirmed: MatchGroup[] = []
  for (const match of matches) {
    if (match.tradelineIds.length <= 3) {
      confirmed.push(platform.decideMatch(sessionId, match.id, 'confirmed', 'Auto-confirmed simple pilot match'))
    }
  }
  return confirmed
}

function kickoffAnalysisFlow(sessionId: string, uploadId: string, body: AnalysisKickoffBody): ConsumerFlowSummary {
  const jurisdiction = normalizeState(body.jurisdiction ?? launchScope?.provisionalSelectedState ?? 'US-CA')
  const report = platform.parseReport(sessionId, uploadId)
  platform.completeReview(sessionId, report.id)
  const matches = platform.proposeMatches(sessionId, report.id)
  const confirmedById = new Map<string, MatchGroup>()
  if (body.autoConfirmSimpleMatches) {
    for (const confirmed of maybeAutoConfirmSimpleMatches(sessionId, matches)) confirmedById.set(confirmed.id, confirmed)
  }
  const updatedMatches = matches.map(match => confirmedById.get(match.id) ?? match)
  const unresolved = updatedMatches.filter(match => match.state !== 'confirmed' && match.state !== 'rejected')
  if (unresolved.length > 0) {
    return { status: 'match-review-required', reportId: report.id, matches: updatedMatches }
  }
  const analysis = platform.runAnalysis(sessionId, report.id, resolveRulesetForJurisdiction(jurisdiction), jurisdiction)
  const consumerReport = platform.createConsumerReport(sessionId, analysis.id)
  const exportArtifact = platform.createExport(sessionId, consumerReport.id)
  return {
    status: 'analysis-complete',
    reportId: report.id,
    matches: updatedMatches,
    analysisId: analysis.id,
    consumerReportId: consumerReport.id,
    exportId: exportArtifact.id,
  }
}

async function handleRegister(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const body = await readJsonBody(request) as ConsumerRegisterBody
  const account = platform.register({ email: body.email, password: body.password })
  respondJson(response, 201, { sessionId: account.sessionId, userId: account.userId, launchScope: launchScope ?? null, onboarding: onboardingPayload(launchScope) })
}

async function handleConsent(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const sessionId = getSessionId(request)
  const body = await readJsonBody(request) as ConsumerConsentBody
  const workspace = platform.recordConsent(sessionId, {
    version: body.version,
    adultUSConsumer: body.adultUSConsumer,
    authorizedReportUse: body.authorizedReportUse,
    educationalLimitations: body.educationalLimitations,
    sensitiveDataHandling: body.sensitiveDataHandling,
    residence: normalizeState(body.residence),
    analysisJurisdiction: normalizeState(body.analysisJurisdiction),
  })
  respondJson(response, 201, { workspaceId: workspace.id, createdAt: workspace.createdAt, launchScope: platform.getLaunchScope() })
}

async function handleAuthorization(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const sessionId = getSessionId(request)
  const authorization = platform.acceptAuthorization(sessionId)
  respondJson(response, 201, authorization)
}

async function handleUploadInit(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const sessionId = getSessionId(request)
  const body = await readJsonBody(request) as UploadInitBody
  const upload = platform.initializeUpload(sessionId, body.workspaceId)
  respondJson(response, 201, upload)
}

async function handleUploadComplete(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const body = await readJsonBody(request) as UploadCompleteBody
  const upload = platform.completeUpload({
    uploadId: body.uploadId,
    token: body.token,
    fileName: body.fileName,
    mediaType: body.mediaType,
    bytes: Buffer.from(body.contentBase64, 'base64'),
  })
  respondJson(response, 201, upload)
}

async function handleKickoffAnalysis(request: IncomingMessage, response: ServerResponse, uploadId: string): Promise<void> {
  const sessionId = getSessionId(request)
  const body = await readJsonBody(request) as AnalysisKickoffBody
  const result = kickoffAnalysisFlow(sessionId, uploadId, body)
  respondJson(response, result.status === 'analysis-complete' ? 201 : 202, result)
}

async function handleMatchDecision(request: IncomingMessage, response: ServerResponse, matchId: string): Promise<void> {
  const sessionId = getSessionId(request)
  const body = await readJsonBody(request) as MatchDecisionBody
  const match = platform.decideMatch(sessionId, matchId, body.action, body.reason)
  respondJson(response, 200, match)
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? '/', `http://${request.headers.host ?? '127.0.0.1'}`)

    if (request.method === 'GET' && url.pathname === '/health') {
      respondJson(response, 200, createHealthStatus('web'))
      return
    }

    if (request.method === 'GET' && url.pathname === '/pilot-availability') {
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

    if (request.method === 'GET' && url.pathname === '/') {
      respondJson(response, 200, {
        service: 'web',
        onboarding: onboardingPayload(launchScope),
      })
      return
    }

    if (request.method === 'POST' && url.pathname === '/consumer/register') {
      await handleRegister(request, response)
      return
    }

    if (request.method === 'POST' && url.pathname === '/consumer/consent') {
      await handleConsent(request, response)
      return
    }

    if (request.method === 'POST' && url.pathname === '/consumer/authorization') {
      await handleAuthorization(request, response)
      return
    }

    if (request.method === 'POST' && url.pathname === '/consumer/uploads/init') {
      await handleUploadInit(request, response)
      return
    }

    if (request.method === 'POST' && url.pathname === '/consumer/uploads/complete') {
      await handleUploadComplete(request, response)
      return
    }

    const kickoffMatch = request.method === 'POST' ? url.pathname.match(/^\/consumer\/uploads\/([^/]+)\/kickoff-analysis$/) : null
    if (kickoffMatch) {
      await handleKickoffAnalysis(request, response, kickoffMatch[1] ?? '')
      return
    }

    const decisionMatch = request.method === 'POST' ? url.pathname.match(/^\/consumer\/matches\/([^/]+)\/decision$/) : null
    if (decisionMatch) {
      await handleMatchDecision(request, response, decisionMatch[1] ?? '')
      return
    }

    respondJson(response, 404, { error: 'Not found' })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error'
    respondJson(response, 400, { error: message })
  }
})

server.listen(port, () => console.log(`web listening on ${port}`))
