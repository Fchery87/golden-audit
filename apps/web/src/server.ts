import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { appendFileSync, existsSync, readFileSync } from 'node:fs'
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
import { createConsumerEmailSender, type ConsumerEmailTransport } from './consumer-email.js'
import { bootstrapGovernance } from './pilot-bootstrap.js'
import { appendRuntimeEvent, resolveRuntimeDbPath, SqlitePlatformStore, FileBlobStore } from './runtime-store.js'

const port = Number(process.env.WEB_PORT ?? 3000)
const runtimeDir = process.env.PILOT_PERSISTENCE_DIR ?? '.scratch/runtime/web'
const platform = new CreditAnalysisPlatform(new SqlitePlatformStore(resolveRuntimeDbPath(runtimeDir)), new FileBlobStore(runtimeDir), undefined, process.env.GOLDEN_AUDIT_OWNER_EMAIL)
const approvalRecordPath = process.env.PILOT_APPROVAL_RECORD_PATH ?? 'docs/pilot-approval-records.json'
const approvalRecords = JSON.parse(readFileSync(approvalRecordPath, 'utf8')) as PilotApprovalRecordFile
const fixtureOnly = approvalRecords.scope === 'test-fixture-only' || /fixture/i.test(approvalRecords.status) || /not approvals?/i.test(approvalRecords._warning ?? '')

// Launch scope and governance/rulesets are operator config, re-seeded fresh at every process
// start (docs/consumer-workflow-implementation-plan.md D5) — unlike user/upload/report/etc.
// data, they are never persisted across restarts, so this always runs regardless of whether
// runtime.sqlite already has consumer data in it from a prior run.
platform.hydrateLaunchScope(approvalRecords)
platform.loadPilotApprovals(approvalRecords)
bootstrapGovernance(platform, 'US-CA')
const launchScope = platform.getLaunchScope()
const launchScopeAvailabilityClaim = fixtureOnly
  ? 'Pilot currently limited to approved pilot states only.'
  : launchScope.availabilityClaim

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
type ConsumerRegisterBody = { email: string; password: string; inviteCode: string }
type ConsumerSignInBody = { email: string; password: string }
type ConsumerConsentBody = {
  version: string
  adultUSConsumer: true
  authorizedReportUse: true
  educationalLimitations: true
  sensitiveDataHandling: true
  residence: string
  analysisJurisdiction: string
}
type ConsumerAuthorizationBody = { version: string; accepted: boolean }
type ConsumerIdentityBody = { fullName: unknown; dateOfBirth: unknown; ssnLastFour: unknown; currentAddress: unknown; previousAddresses?: unknown; attestationVersion?: unknown; accurateAndComplete?: unknown }
type UploadInitBody = { workspaceId: string }
type UploadCompleteBody = { uploadId: string; token: string; fileName: string; mediaType: string; contentBase64: string }
type AnalysisKickoffBody = { jurisdiction?: string }
type AdminProfileBody = { expectedRevision: number; profile: Record<string, unknown> }
type MatchDecisionBody = { action: 'confirmed' | 'rejected' | 'split' | 'merged'; reason: string }
type MatchSubgroupBody = { tradelineIds: string[]; reason: string }
type CompleteAnalysisBody = { jurisdiction?: string }
type ReviewValueBody = { decision: 'confirmed' | 'corrected' | 'unknown' | 'not-shown'; reason: string; replacement?: string | number }
type PasswordResetRequestBody = { email: string }
type PasswordResetConfirmBody = { token: string; newPassword: string }
type VerifyEmailBody = { token: string }

type TradelineSummary = { id: string; bureau: string; creditor: string; maskedAccount: string; balanceCents: number | null }

type ConsumerFlowSummary = {
  status: 'analysis-complete' | 'match-review-required'
  reportId: string
  matches?: MatchGroup[]
  tradelines?: TradelineSummary[]
  required?: number
  decided?: number
  analysisId?: string
  consumerReportId?: string
  exportId?: string
}

function recordRuntimeEvent(event: RuntimeEvent): void {
  try {
    appendRuntimeEvent(runtimeDir, event)
  } catch {
    // Runtime-event logging is best-effort diagnostics, not the consumer data path (D5) — a
    // failure here must never surface as a request failure.
  }
}

const SESSION_COOKIE = 'golden_audit_session'
const localEmailOutboxPath = process.env.PILOT_EMAIL_OUTBOX_PATH
if (localEmailOutboxPath && !localEmailOutboxPath.startsWith(`${runtimeDir}/`)) throw new Error('PILOT_EMAIL_OUTBOX_PATH must remain inside PILOT_PERSISTENCE_DIR')
const localEmailSender = localEmailOutboxPath
  ? createConsumerEmailSender({
      appBaseUrl: process.env.CONSUMER_APP_URL ?? 'https://pilot.local.test/app',
      from: process.env.CONSUMER_EMAIL_FROM ?? 'Golden Audit <no-reply@pilot.local.test>',
      transport: {
        send: async message => { appendFileSync(localEmailOutboxPath, `${JSON.stringify(message)}\n`, { encoding: 'utf8', mode: 0o600 }) },
      } satisfies ConsumerEmailTransport,
    })
  : undefined
const SESSION_COOKIE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60

/** D10: sessions travel as an httpOnly cookie, never a JS-readable header/localStorage bearer token. */
function getSessionId(request: IncomingMessage): string {
  const header = request.headers.cookie ?? ''
  for (const part of header.split(';')) {
    const [name, ...rest] = part.trim().split('=')
    if (name === SESSION_COOKIE) return decodeURIComponent(rest.join('='))
  }
  throw new Error('Authentication required')
}
function sessionCookieHeader(sessionId: string, maxAgeSeconds: number): string {
  return `${SESSION_COOKIE}=${encodeURIComponent(sessionId)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAgeSeconds}`
}
function clearSessionCookieHeader(): string {
  return `${SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`
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

function respondJson(response: ServerResponse, statusCode: number, body: unknown, extraHeaders: Record<string, string> = {}): void {
  response.writeHead(statusCode, { 'content-type': 'application/json; charset=utf-8', ...extraHeaders })
  response.end(JSON.stringify(body))
}

function normalizeState(value: string): Jurisdiction {
  return (value.startsWith('US-') ? value : `US-${value}`) as Jurisdiction
}

function onboardingPayload(scope: LaunchScope | undefined): JsonRecord {
  return buildPilotOnboardingPayload(scope, launchScopeAvailabilityClaim, fixtureOnly)
}

function resolveRulesetForJurisdiction(jurisdiction: Jurisdiction): string {
  const version = platform.getPublishedRulesetVersionFor(jurisdiction)
  if (!version) throw new Error(`No published ruleset is available for ${jurisdiction}`)
  return version
}

/**
 * Upload → reading, in one call.
 *
 * Parse, match, analyze, render, and export all run here. Nothing in this sequence needs a human
 * decision: unambiguous account groups confirm themselves, ambiguous ones suppress the checks
 * that would have used them, and low-confidence values suppress on their own.
 */
async function kickoffAnalysisFlow(sessionId: string, uploadId: string, body: AnalysisKickoffBody): Promise<ConsumerFlowSummary> {
  const jurisdiction = normalizeState(body.jurisdiction ?? launchScope?.provisionalSelectedState ?? 'US-CA')
  const report = await platform.parseReport(sessionId, uploadId)
  await platform.proposeMatches(sessionId, report.id)
  const completed = await completeAnalysisForReport(sessionId, report.id, jurisdiction)
  return { status: 'analysis-complete', reportId: report.id, ...completed }
}

async function completeAnalysisForReport(sessionId: string, reportId: string, jurisdiction: Jurisdiction): Promise<{ analysisId: string; consumerReportId: string; exportId: string }> {
  const analysis = await platform.runAnalysis(sessionId, reportId, resolveRulesetForJurisdiction(jurisdiction), jurisdiction)
  const consumerReport = await platform.createConsumerReport(sessionId, analysis.id)
  const exportArtifact = await platform.createExport(sessionId, consumerReport.id)
  return { analysisId: analysis.id, consumerReportId: consumerReport.id, exportId: exportArtifact.id }
}

async function handleCompleteAnalysis(request: IncomingMessage, response: ServerResponse, reportId: string): Promise<void> {
  const sessionId = getSessionId(request)
  const body = await readJsonBody(request) as CompleteAnalysisBody
  const jurisdiction = normalizeState(body.jurisdiction ?? launchScope?.provisionalSelectedState ?? 'US-CA')
  const completed = await completeAnalysisForReport(sessionId, reportId, jurisdiction)
  respondJson(response, 201, { status: 'analysis-complete', reportId, ...completed })
}

async function handleRegister(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const body = await readJsonBody(request) as ConsumerRegisterBody
  const account = await platform.register({ email: body.email, password: body.password, inviteCode: body.inviteCode })
  recordRuntimeEvent(createRuntimeEvent({ kind: 'pilot-transition', at: new Date().toISOString(), transition: 'register', message: `registered ${account.userId}` }))
  respondJson(response, 201, { userId: account.userId, launchScope: launchScope ?? null, onboarding: onboardingPayload(launchScope) }, { 'set-cookie': sessionCookieHeader(account.sessionId, SESSION_COOKIE_MAX_AGE_SECONDS) })
}

async function handleSignIn(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const body = await readJsonBody(request) as ConsumerSignInBody
  const sessionId = await platform.signIn({ email: body.email, password: body.password })
  respondJson(response, 200, { status: 'signed-in' }, { 'set-cookie': sessionCookieHeader(sessionId, SESSION_COOKIE_MAX_AGE_SECONDS) })
}

async function handleSignOut(request: IncomingMessage, response: ServerResponse): Promise<void> {
  try { await platform.signOut(getSessionId(request)) } catch { /* already signed out / no cookie — clearing it is still correct */ }
  respondJson(response, 200, { status: 'signed-out' }, { 'set-cookie': clearSessionCookieHeader() })
}

async function handleConsent(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const sessionId = getSessionId(request)
  const body = await readJsonBody(request) as ConsumerConsentBody
  const workspace = await platform.recordConsent(sessionId, {
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
  const body = await readJsonBody(request) as Partial<ConsumerAuthorizationBody>
  if (!body.version || body.accepted !== true) throw new Error('Current written authorization must be affirmatively accepted')
  const authorization = await platform.acceptAuthorization(sessionId, { version: body.version, accepted: body.accepted })
  respondJson(response, 201, authorization)
}
async function handleDisclosure(_request: IncomingMessage, response: ServerResponse): Promise<void> { respondJson(response, 200, platform.getDisclosure()) }
async function handleDashboard(request: IncomingMessage, response: ServerResponse): Promise<void> { respondJson(response, 200, await platform.getConsumerDashboard(getSessionId(request))) }

async function handleAdminDashboard(request: IncomingMessage, response: ServerResponse): Promise<void> {
  respondJson(response, 200, await platform.getAdminDashboard(getSessionId(request)))
}
async function handleAdminProfile(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const sessionId = getSessionId(request)
  const csrfToken = request.headers['x-golden-audit-csrf']
  if (typeof csrfToken !== 'string') throw new Error('Invalid request protection token')
  const body = await readJsonBody(request) as AdminProfileBody
  if (!Number.isInteger(body.expectedRevision) || !body.profile || typeof body.profile !== 'object' || Array.isArray(body.profile)) throw new Error('Profile update is invalid')
  const profile = await platform.updateReportPresentationProfile(sessionId, csrfToken, body.expectedRevision, body.profile)
  respondJson(response, 200, profile)
}

async function handleUploadInit(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const sessionId = getSessionId(request)
  const body = await readJsonBody(request) as UploadInitBody
  const upload = await platform.initializeUpload(sessionId, body.workspaceId)
  respondJson(response, 201, upload)
}

async function handleUploadComplete(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const body = await readJsonBody(request) as UploadCompleteBody
  const upload = await platform.completeUpload({
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
  const result = await kickoffAnalysisFlow(sessionId, uploadId, body)
  if (result.status === 'analysis-complete') {
    recordRuntimeEvent(createRuntimeEvent({ kind: 'analysis-complete', at: new Date().toISOString(), reportId: result.reportId, uploadId, message: 'analysis completed successfully' }))
  } else {
    recordRuntimeEvent(createRuntimeEvent({ kind: 'pilot-transition', at: new Date().toISOString(), transition: 'match-review-required', message: `manual review required for ${result.reportId}` }))
  }
  respondJson(response, result.status === 'analysis-complete' ? 201 : 202, result)
}

async function handleValueReview(request: IncomingMessage, response: ServerResponse, reportId: string): Promise<void> {
  respondJson(response, 200, await platform.getValueReview(getSessionId(request), reportId))
}
async function handleValueDecision(request: IncomingMessage, response: ServerResponse, reportId: string, valueId: string): Promise<void> {
  const body = await readJsonBody(request) as ReviewValueBody
  respondJson(response, 200, await platform.reviewValue(getSessionId(request), reportId, valueId, body))
}
/** Closing the optional corrections pass re-runs analysis so any correction actually reaches the
 *  reading. Nothing is gated on it — a consumer who never opens it still has a delivered report. */
async function handleCompleteValueReview(request: IncomingMessage, response: ServerResponse, reportId: string): Promise<void> {
  const sessionId = getSessionId(request)
  await platform.completeReview(sessionId, reportId)
  const jurisdiction = normalizeState(launchScope?.provisionalSelectedState ?? 'US-CA')
  const completed = await completeAnalysisForReport(sessionId, reportId, jurisdiction)
  respondJson(response, 201, { status: 'analysis-complete', reportId, ...completed })
}

async function handlePendingMatches(request: IncomingMessage, response: ServerResponse, reportId: string): Promise<void> {
  respondJson(response, 200, await platform.listPendingMatches(getSessionId(request), reportId))
}

async function handleGetIdentity(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const identity = await platform.getConsumerIdentity(getSessionId(request))
  respondJson(response, 200, { identity: identity ?? null })
}
async function handleRecordIdentity(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const sessionId = getSessionId(request)
  const body = await readJsonBody(request) as ConsumerIdentityBody
  respondJson(response, 201, await platform.recordConsumerIdentity(sessionId, body))
}

async function handleMatchDecision(request: IncomingMessage, response: ServerResponse, matchId: string): Promise<void> {
  const sessionId = getSessionId(request)
  const body = await readJsonBody(request) as MatchDecisionBody
  const match = await platform.decideMatch(sessionId, matchId, body.action, body.reason)
  respondJson(response, 200, match)
}

async function handleMatchSubgroup(request: IncomingMessage, response: ServerResponse, matchId: string): Promise<void> {
  const sessionId = getSessionId(request)
  const body = await readJsonBody(request) as MatchSubgroupBody
  const match = await platform.confirmMatchSubgroup(sessionId, matchId, body.tradelineIds, body.reason)
  respondJson(response, 201, match)
}

async function handleGetAnalysis(request: IncomingMessage, response: ServerResponse, analysisId: string): Promise<void> {
  const sessionId = getSessionId(request)
  respondJson(response, 200, await platform.getAnalysis(sessionId, analysisId))
}

async function handleGetConsumerReport(request: IncomingMessage, response: ServerResponse, consumerReportId: string): Promise<void> {
  const sessionId = getSessionId(request)
  respondJson(response, 200, await platform.getConsumerReport(sessionId, consumerReportId))
}

async function handleGetExport(request: IncomingMessage, response: ServerResponse, exportId: string): Promise<void> {
  const sessionId = getSessionId(request)
  respondJson(response, 200, await platform.getExport(sessionId, exportId))
}

/** D5: the consumer's written-in deletion promise (AUTHORIZATION_TEXT) was previously
 *  unenforceable — requestDeletion existed but no route ever called it. */
async function handleDeletion(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const sessionId = getSessionId(request)
  const receipt = await platform.requestDeletion(sessionId)
  respondJson(response, 201, receipt, { 'set-cookie': clearSessionCookieHeader() })
}

async function handlePasswordResetRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const body = await readJsonBody(request) as PasswordResetRequestBody
  const result = await platform.requestPasswordReset(body.email)
  if (result && localEmailSender) {
    try { await localEmailSender.sendPasswordReset(result) } catch { /* Preserve the enumeration-safe response; local operators inspect configured delivery separately. */ }
  }
  respondJson(response, 200, { status: 'if-account-exists-reset-issued' })
}
async function handlePasswordResetConfirm(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const body = await readJsonBody(request) as PasswordResetConfirmBody
  await platform.resetPassword(body.token, body.newPassword)
  respondJson(response, 200, { status: 'password-reset' }, { 'set-cookie': clearSessionCookieHeader() })
}
async function handleEmailVerificationRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const sessionId = getSessionId(request)
  const result = await platform.requestEmailVerification(sessionId)
  if (!localEmailSender) throw new Error('Transactional email is not configured for this local server')
  await localEmailSender.sendEmailVerification(result)
  respondJson(response, 200, { status: 'verification-issued' })
}
async function handleVerifyEmail(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const body = await readJsonBody(request) as VerifyEmailBody
  await platform.verifyEmail(body.token)
  respondJson(response, 200, { status: 'email-verified' })
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? '/', `http://${request.headers.host ?? '127.0.0.1'}`)
    const path = url.pathname.startsWith('/api/') ? url.pathname.slice(4) : url.pathname

    if (request.method === 'GET' && path === '/health') {
      respondJson(response, 200, createHealthStatus('web'))
      return
    }

    if (request.method === 'GET' && path === '/pilot-availability') {
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
      respondJson(response, 200, buildPilotAvailabilityPayload(launchScope, fixtureOnly, normalizedState))
      return
    }

    if (request.method === 'GET' && path === '/') {
      respondJson(response, 200, {
        service: 'web',
        onboarding: onboardingPayload(launchScope),
      })
      return
    }

    if (request.method === 'GET' && (path === '/app' || path === '/debug' || path === '/admin')) {
      serveClientIndex(response)
      return
    }

    if (request.method === 'GET' && path.startsWith('/assets/')) {
      serveStaticAsset(response, path.slice(1))
      return
    }

    if (request.method === 'GET' && path === '/admin/dashboard') return await handleAdminDashboard(request, response)
    if (request.method === 'POST' && path === '/admin/profile') return await handleAdminProfile(request, response)
    if (request.method === 'GET' && path === '/consumer/disclosures') return await handleDisclosure(request, response)
    if (request.method === 'GET' && path === '/consumer/dashboard') return await handleDashboard(request, response)
    if (request.method === 'POST' && path === '/consumer/register') return await handleRegister(request, response)
    if (request.method === 'POST' && path === '/consumer/sign-in') return await handleSignIn(request, response)
    if (request.method === 'POST' && path === '/consumer/sign-out') return await handleSignOut(request, response)
    if (request.method === 'POST' && path === '/consumer/password-reset/request') return await handlePasswordResetRequest(request, response)
    if (request.method === 'POST' && path === '/consumer/password-reset/confirm') return await handlePasswordResetConfirm(request, response)
    if (request.method === 'POST' && path === '/consumer/email-verification/request') return await handleEmailVerificationRequest(request, response)
    if (request.method === 'POST' && path === '/consumer/email-verification/confirm') return await handleVerifyEmail(request, response)
    if (request.method === 'GET' && path === '/consumer/identity') return await handleGetIdentity(request, response)
    if (request.method === 'POST' && path === '/consumer/identity') return await handleRecordIdentity(request, response)
    if (request.method === 'POST' && path === '/consumer/consent') return await handleConsent(request, response)
    if (request.method === 'POST' && path === '/consumer/authorization') return await handleAuthorization(request, response)
    if (request.method === 'POST' && path === '/consumer/uploads/init') return await handleUploadInit(request, response)
    if (request.method === 'POST' && path === '/consumer/uploads/complete') return await handleUploadComplete(request, response)
    if (request.method === 'POST' && path === '/consumer/deletion') return await handleDeletion(request, response)

    const valueReviewMatch = path.match(/^\/consumer\/reports\/([^/]+)\/value-review$/)
    if (valueReviewMatch && request.method === 'GET') return await handleValueReview(request, response, valueReviewMatch[1] ?? '')
    if (valueReviewMatch && request.method === 'POST') return await handleCompleteValueReview(request, response, valueReviewMatch[1] ?? '')
    const valueDecisionMatch = request.method === 'POST' ? path.match(/^\/consumer\/reports\/([^/]+)\/values\/([^/]+)\/decision$/) : null
    if (valueDecisionMatch) return await handleValueDecision(request, response, valueDecisionMatch[1] ?? '', valueDecisionMatch[2] ?? '')

    const pendingMatchesMatch = request.method === 'GET' ? path.match(/^\/consumer\/reports\/([^/]+)\/pending-matches$/) : null
    if (pendingMatchesMatch) return await handlePendingMatches(request, response, pendingMatchesMatch[1] ?? '')
    const kickoffMatch = request.method === 'POST' ? path.match(/^\/consumer\/uploads\/([^/]+)\/kickoff-analysis$/) : null
    if (kickoffMatch) return await handleKickoffAnalysis(request, response, kickoffMatch[1] ?? '')

    const subgroupMatch = request.method === 'POST' ? path.match(/^\/consumer\/matches\/([^/]+)\/confirm-subgroup$/) : null
    if (subgroupMatch) return await handleMatchSubgroup(request, response, subgroupMatch[1] ?? '')

    const completeAnalysisMatch = request.method === 'POST' ? path.match(/^\/consumer\/reports\/([^/]+)\/complete-analysis$/) : null
    if (completeAnalysisMatch) return await handleCompleteAnalysis(request, response, completeAnalysisMatch[1] ?? '')

    const decisionMatch = request.method === 'POST' ? path.match(/^\/consumer\/matches\/([^/]+)\/decision$/) : null
    if (decisionMatch) return await handleMatchDecision(request, response, decisionMatch[1] ?? '')

    const analysisMatch = request.method === 'GET' ? path.match(/^\/consumer\/analyses\/([^/]+)$/) : null
    if (analysisMatch) return await handleGetAnalysis(request, response, analysisMatch[1] ?? '')

    const consumerReportMatch = request.method === 'GET' ? path.match(/^\/consumer\/reports\/([^/]+)$/) : null
    if (consumerReportMatch) return await handleGetConsumerReport(request, response, consumerReportMatch[1] ?? '')

    const exportMatch = request.method === 'GET' ? path.match(/^\/consumer\/exports\/([^/]+)$/) : null
    if (exportMatch) return await handleGetExport(request, response, exportMatch[1] ?? '')

    if (request.method === 'GET' && extname(path)) {
      serveStaticAsset(response, path.slice(1))
      return
    }

    respondJson(response, 404, { error: 'Not found' })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error'
    recordRuntimeEvent(createRuntimeEvent({ kind: 'release-gate-failure', at: new Date().toISOString(), gate: `${request.method ?? 'UNKNOWN'} ${(request.url ?? '/')}`, message }))
    respondJson(response, 400, { error: message })
  }
})

server.listen(port, () => console.log(`web listening on ${port}`))
