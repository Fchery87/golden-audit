import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { existsSync, readFileSync } from 'node:fs'
import { extname, join, normalize } from 'node:path'
import { createHealthStatus, createRuntimeEvent, type RuntimeEvent } from '../../../packages/domain/src/index.js'
import {
  CreditAnalysisPlatform,
  type Jurisdiction,
  type PilotApprovalRecordFile,
  type LaunchScope,
  type MatchGroup,
} from '../../../packages/platform/src/index.js'
import { buildPilotAvailabilityPayload, buildPilotOnboardingPayload } from './pilot-state.js'
import { appendRuntimeEvent, loadPlatformRuntime, savePlatformRuntime } from './runtime-store.js'

const port = Number(process.env.WEB_PORT ?? 3000)
const runtimeDir = process.env.PILOT_PERSISTENCE_DIR ?? '.scratch/runtime/web'
const platform = new CreditAnalysisPlatform()
const approvalRecordPath = process.env.PILOT_APPROVAL_RECORD_PATH ?? 'docs/pilot-approval-records.json'
const approvalRecords = JSON.parse(readFileSync(approvalRecordPath, 'utf8')) as PilotApprovalRecordFile
const fixtureOnly = approvalRecords.scope === 'test-fixture-only' || /fixture/i.test(approvalRecords.status) || /not approvals?/i.test(approvalRecords._warning ?? '')
let hydratedLaunchScope: LaunchScope | undefined
const runtimeLoaded = loadPlatformRuntime(platform, runtimeDir)
if (runtimeLoaded) {
  hydratedLaunchScope = platform.getLaunchScope()
} else {
  hydratedLaunchScope = platform.hydrateLaunchScope(approvalRecords)
  platform.loadPilotApprovals(approvalRecords)
  bootstrapPublishedRulesets(platform)
  persistPlatform()
  hydratedLaunchScope = platform.getLaunchScope()
}
const launchScope = platform.getLaunchScope()
const launchScopeAvailabilityClaim = fixtureOnly
  ? 'Pilot currently limited to approved pilot states only.'
  : launchScope.availabilityClaim
const publishedRulesetByJurisdiction = getPublishedRulesetByJurisdiction(platform)

const clientDistPath = existsSync(join(process.cwd(), 'apps/web/client/dist'))
  ? join(process.cwd(), 'apps/web/client/dist')
  : null

const mimeByExtension: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.woff2': 'font/woff2',
  '.json': 'application/json; charset=utf-8',
  '.ico': 'image/x-icon',
}

function serveStaticAsset(response: ServerResponse, relativePath: string): void {
  if (!clientDistPath) {
    respondJson(response, 404, { error: 'Frontend not built. Run: npm run build:web' })
    return
  }
  const safe = normalize(relativePath).replace(/^(\.\.[/\\])+/, '')
  const filePath = join(clientDistPath, safe)
  if (!filePath.startsWith(clientDistPath) || !existsSync(filePath)) {
    respondJson(response, 404, { error: 'Not found' })
    return
  }
  response.writeHead(200, { 'content-type': mimeByExtension[extname(filePath)] ?? 'application/octet-stream' })
  response.end(readFileSync(filePath))
}

function serveClientIndex(response: ServerResponse): void {
  if (!clientDistPath) {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    response.end('<!doctype html><meta charset="utf-8"><title>Golden Audit</title><p>Frontend not built. Run: <code>npm run build:web</code></p>')
    return
  }
  response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
  response.end(readFileSync(join(clientDistPath, 'index.html')))
}

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
type MatchSubgroupBody = { tradelineIds: string[]; reason: string }

type TradelineSummary = { id: string; bureau: string; creditor: string; maskedAccount: string; balanceCents: number | null }

type ConsumerFlowSummary = {
  status: 'analysis-complete' | 'match-review-required'
  reportId: string
  matches: MatchGroup[]
  tradelines?: TradelineSummary[]
  analysisId?: string
  consumerReportId?: string
  exportId?: string
}

type CompleteAnalysisBody = { jurisdiction?: string }

function persistPlatform(): void {
  try {
    savePlatformRuntime(platform, runtimeDir)
  } catch (error) {
    recordRuntimeEvent(createRuntimeEvent({
      kind: 'persistence-failure',
      at: new Date().toISOString(),
      message: error instanceof Error ? error.message : 'Unexpected persistence failure',
    }))
    throw error
  }
}

function recordRuntimeEvent(event: RuntimeEvent): void {
  appendRuntimeEvent(runtimeDir, event)
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

function getPublishedRulesetByJurisdiction(app: CreditAnalysisPlatform): Partial<Record<Jurisdiction, string>> {
  const published = app.exportSnapshot().publishedRulesets
  const californiaRuleset = published.find(([, rules]) => rules.some(rule => rule.jurisdiction === 'US-CA'))
  if (!californiaRuleset) throw new Error('No published ruleset is available for US-CA')
  return { 'US-CA': californiaRuleset[0] }
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
  return buildPilotOnboardingPayload(scope, launchScopeAvailabilityClaim, fixtureOnly)
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
    const tradelines: TradelineSummary[] = report.tradelines.map(line => ({
      id: line.id,
      bureau: String(line.creditor.bureau),
      creditor: line.creditor.normalized ?? '',
      maskedAccount: line.maskedAccount.normalized ?? '',
      balanceCents: line.balance.normalized ?? null,
    }))
    return { status: 'match-review-required', reportId: report.id, matches: updatedMatches, tradelines }
  }
  const completed = completeAnalysisForReport(sessionId, report.id, jurisdiction)
  return { status: 'analysis-complete', reportId: report.id, matches: updatedMatches, ...completed }
}

function completeAnalysisForReport(sessionId: string, reportId: string, jurisdiction: Jurisdiction): { analysisId: string; consumerReportId: string; exportId: string } {
  const analysis = platform.runAnalysis(sessionId, reportId, resolveRulesetForJurisdiction(jurisdiction), jurisdiction)
  const consumerReport = platform.createConsumerReport(sessionId, analysis.id)
  const exportArtifact = platform.createExport(sessionId, consumerReport.id)
  return { analysisId: analysis.id, consumerReportId: consumerReport.id, exportId: exportArtifact.id }
}

async function handleCompleteAnalysis(request: IncomingMessage, response: ServerResponse, reportId: string): Promise<void> {
  const sessionId = getSessionId(request)
  const body = await readJsonBody(request) as CompleteAnalysisBody
  const jurisdiction = normalizeState(body.jurisdiction ?? launchScope?.provisionalSelectedState ?? 'US-CA')
  const completed = completeAnalysisForReport(sessionId, reportId, jurisdiction)
  persistPlatform()
  respondJson(response, 201, { status: 'analysis-complete', reportId, ...completed })
}

async function handleRegister(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const body = await readJsonBody(request) as ConsumerRegisterBody
  const account = platform.register({ email: body.email, password: body.password })
  persistPlatform()
  recordRuntimeEvent(createRuntimeEvent({ kind: 'pilot-transition', at: new Date().toISOString(), transition: 'register', message: `registered ${account.userId}` }))
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
  recordRuntimeEvent(createRuntimeEvent({ kind: 'upload-complete', at: new Date().toISOString(), uploadId: upload.id, message: 'upload completed successfully' }))
  respondJson(response, 201, upload)
}

async function handleKickoffAnalysis(request: IncomingMessage, response: ServerResponse, uploadId: string): Promise<void> {
  const sessionId = getSessionId(request)
  const body = await readJsonBody(request) as AnalysisKickoffBody
  const result = kickoffAnalysisFlow(sessionId, uploadId, body)
  if (result.status === 'analysis-complete') {
    recordRuntimeEvent(createRuntimeEvent({ kind: 'analysis-complete', at: new Date().toISOString(), reportId: result.reportId, uploadId, message: 'analysis completed successfully' }))
  } else {
    recordRuntimeEvent(createRuntimeEvent({ kind: 'pilot-transition', at: new Date().toISOString(), transition: 'match-review-required', message: `manual review required for ${result.reportId}` }))
  }
  respondJson(response, result.status === 'analysis-complete' ? 201 : 202, result)
}

async function handleMatchDecision(request: IncomingMessage, response: ServerResponse, matchId: string): Promise<void> {
  const sessionId = getSessionId(request)
  const body = await readJsonBody(request) as MatchDecisionBody
  const match = platform.decideMatch(sessionId, matchId, body.action, body.reason)
  persistPlatform()
  respondJson(response, 200, match)
}

async function handleMatchSubgroup(request: IncomingMessage, response: ServerResponse, matchId: string): Promise<void> {
  const sessionId = getSessionId(request)
  const body = await readJsonBody(request) as MatchSubgroupBody
  const match = platform.confirmMatchSubgroup(sessionId, matchId, body.tradelineIds, body.reason)
  persistPlatform()
  respondJson(response, 201, match)
}

async function handleGetAnalysis(request: IncomingMessage, response: ServerResponse, analysisId: string): Promise<void> {
  const sessionId = getSessionId(request)
  respondJson(response, 200, platform.getAnalysis(sessionId, analysisId))
}

async function handleGetConsumerReport(request: IncomingMessage, response: ServerResponse, consumerReportId: string): Promise<void> {
  const sessionId = getSessionId(request)
  respondJson(response, 200, platform.getConsumerReport(sessionId, consumerReportId))
}

async function handleGetExport(request: IncomingMessage, response: ServerResponse, exportId: string): Promise<void> {
  const sessionId = getSessionId(request)
  respondJson(response, 200, platform.getExport(sessionId, exportId))
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
      respondJson(response, 200, buildPilotAvailabilityPayload(launchScope, fixtureOnly, normalizedState))
      return
    }

    if (request.method === 'GET' && url.pathname === '/') {
      respondJson(response, 200, {
        service: 'web',
        onboarding: onboardingPayload(launchScope),
      })
      return
    }

    if (request.method === 'GET' && url.pathname === '/app') {
      serveClientIndex(response)
      return
    }

    if (request.method === 'GET' && url.pathname.startsWith('/assets/')) {
      serveStaticAsset(response, url.pathname.slice(1))
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
      persistPlatform()
      return
    }

    const subgroupMatch = request.method === 'POST' ? url.pathname.match(/^\/consumer\/matches\/([^/]+)\/confirm-subgroup$/) : null
    if (subgroupMatch) {
      await handleMatchSubgroup(request, response, subgroupMatch[1] ?? '')
      return
    }

    const completeAnalysisMatch = request.method === 'POST' ? url.pathname.match(/^\/consumer\/reports\/([^/]+)\/complete-analysis$/) : null
    if (completeAnalysisMatch) {
      await handleCompleteAnalysis(request, response, completeAnalysisMatch[1] ?? '')
      return
    }

    const decisionMatch = request.method === 'POST' ? url.pathname.match(/^\/consumer\/matches\/([^/]+)\/decision$/) : null
    if (decisionMatch) {
      await handleMatchDecision(request, response, decisionMatch[1] ?? '')
      return
    }

    const analysisMatch = request.method === 'GET' ? url.pathname.match(/^\/consumer\/analyses\/([^/]+)$/) : null
    if (analysisMatch) {
      await handleGetAnalysis(request, response, analysisMatch[1] ?? '')
      return
    }

    const consumerReportMatch = request.method === 'GET' ? url.pathname.match(/^\/consumer\/reports\/([^/]+)$/) : null
    if (consumerReportMatch) {
      await handleGetConsumerReport(request, response, consumerReportMatch[1] ?? '')
      return
    }

    const exportMatch = request.method === 'GET' ? url.pathname.match(/^\/consumer\/exports\/([^/]+)$/) : null
    if (exportMatch) {
      await handleGetExport(request, response, exportMatch[1] ?? '')
      return
    }

    if (request.method === 'GET' && extname(url.pathname)) {
      serveStaticAsset(response, url.pathname.slice(1))
      return
    }

    respondJson(response, 404, { error: 'Not found' })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error'
    recordRuntimeEvent(createRuntimeEvent({ kind: 'release-gate-failure', at: new Date().toISOString(), gate: `${request.method ?? 'UNKNOWN'} ${(request.url ?? '/')}` , message }))
    respondJson(response, 400, { error: message })
  }
})

server.listen(port, () => console.log(`web listening on ${port}`))
