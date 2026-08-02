import type { PagesFunction } from '@cloudflare/workers-types'
import { type Jurisdiction, type MatchGroup } from '../../../../../packages/platform/src/index.js'
import { loadPilotPlatform, loadPilotRuntime, loadConsumerEmailSender, type PilotPagesEnv } from '../_platform.js'
import { buildPilotAvailabilityPayload, buildPilotOnboardingPayload } from '../../../src/pilot-state.js'

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

const SESSION_COOKIE = 'golden_audit_session'

/** D10: register/sign-in/password-reset are the endpoints an attacker would script (credential
 *  stuffing, account enumeration, invite-code guessing) — rate limit by client IP. Throws a
 *  RateLimitedError-shaped Error the top-level handler turns into a 429. */
async function enforceAuthRateLimit(env: PilotPagesEnv, request: any): Promise<void> {
  const ip = request.headers.get('cf-connecting-ip') ?? 'unknown'
  const { success } = await env.AUTH_RATE_LIMITER.limit({ key: ip })
  if (!success) throw new RateLimitedError()
}
class RateLimitedError extends Error {
  constructor() { super('Too many attempts. Please try again shortly.') }
}

function respondJson(body: unknown, status = 200, extraHeaders: Record<string, string> = {}): any {
  return new globalThis.Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...extraHeaders },
  })
}

async function readJsonBody(request: any): Promise<JsonRecord> {
  const parsed: unknown = await request.json()
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('JSON body must be an object')
  return parsed as JsonRecord
}

/** D10: sessions travel as an httpOnly cookie, never a JS-readable header/localStorage bearer token. */
function getSessionId(request: any): string {
  const header = request.headers.get('cookie') ?? ''
  for (const part of header.split(';')) {
    const [name, ...rest] = part.trim().split('=')
    if (name === SESSION_COOKIE) return decodeURIComponent(rest.join('='))
  }
  throw new Error('Authentication required')
}

function sessionCookieHeader(request: any, sessionId: string, maxAgeSeconds: number): string {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : ''
  return `${SESSION_COOKIE}=${encodeURIComponent(sessionId)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAgeSeconds}${secure}`
}
function clearSessionCookieHeader(request: any): string {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : ''
  return `${SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secure}`
}
/** Matches CreditAnalysisPlatform's SESSION_ABSOLUTE_TTL_MS (30 days) — the cookie's own
 *  lifetime is cosmetic (the server-side session row is authoritative either way), but keeping
 *  them aligned avoids a cookie that outlives (or badly underlives) the session it carries. */
const SESSION_COOKIE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60

function normalizeState(value: string): Jurisdiction {
  return (value.startsWith('US-') ? value : `US-${value}`) as Jurisdiction
}

function getPath(request: any): string {
  return new URL(request.url).pathname
}

function matchPrefix(path: string, pattern: RegExp): RegExpExecArray | null {
  return pattern.exec(path)
}

async function handleRegister(env: PilotPagesEnv, request: any): Promise<Response> {
  await enforceAuthRateLimit(env, request)
  const body = await readJsonBody(request) as ConsumerRegisterBody
  const platform = loadPilotPlatform(env)
  const account = await platform.register({ email: body.email, password: body.password, inviteCode: body.inviteCode })
  return respondJson(
    { userId: account.userId, launchScope: platform.getLaunchScope(), onboarding: buildPilotOnboardingPayload(platform.getLaunchScope(), 'Pilot currently limited to approved pilot states only.', true) },
    201,
    { 'set-cookie': sessionCookieHeader(request, account.sessionId, SESSION_COOKIE_MAX_AGE_SECONDS) },
  )
}

async function handleSignIn(env: PilotPagesEnv, request: any): Promise<Response> {
  await enforceAuthRateLimit(env, request)
  const body = await readJsonBody(request) as ConsumerSignInBody
  const platform = loadPilotPlatform(env)
  const sessionId = await platform.signIn({ email: body.email, password: body.password })
  return respondJson({ status: 'signed-in' }, 200, { 'set-cookie': sessionCookieHeader(request, sessionId, SESSION_COOKIE_MAX_AGE_SECONDS) })
}

async function handleSignOut(env: PilotPagesEnv, request: any): Promise<Response> {
  const platform = loadPilotPlatform(env)
  try { await platform.signOut(getSessionId(request)) } catch { /* already signed out / no cookie — clearing it is still correct */ }
  return respondJson({ status: 'signed-out' }, 200, { 'set-cookie': clearSessionCookieHeader(request) })
}

async function handleConsent(env: PilotPagesEnv, request: any): Promise<Response> {
  const sessionId = getSessionId(request)
  const body = await readJsonBody(request) as ConsumerConsentBody
  const platform = loadPilotPlatform(env)
  const workspace = await platform.recordConsent(sessionId, {
    version: body.version,
    adultUSConsumer: body.adultUSConsumer,
    authorizedReportUse: body.authorizedReportUse,
    educationalLimitations: body.educationalLimitations,
    sensitiveDataHandling: body.sensitiveDataHandling,
    residence: normalizeState(body.residence),
    analysisJurisdiction: normalizeState(body.analysisJurisdiction),
  })
  return respondJson({ workspaceId: workspace.id, createdAt: workspace.createdAt, launchScope: platform.getLaunchScope() }, 201)
}

async function handleAuthorization(env: PilotPagesEnv, request: any): Promise<Response> {
  const sessionId = getSessionId(request)
  const body = await readJsonBody(request) as Partial<ConsumerAuthorizationBody>
  if (!body.version || body.accepted !== true) throw new Error('Current written authorization must be affirmatively accepted')
  const platform = loadPilotPlatform(env)
  const authorization = await platform.acceptAuthorization(sessionId, { version: body.version, accepted: body.accepted })
  return respondJson(authorization, 201)
}
async function handleDisclosure(env: PilotPagesEnv): Promise<Response> { return respondJson(loadPilotPlatform(env).getDisclosure()) }
async function handleDashboard(env: PilotPagesEnv, request: any): Promise<Response> { return respondJson(await loadPilotPlatform(env).getConsumerDashboard(getSessionId(request))) }

async function handleAdminDashboard(env: PilotPagesEnv, request: any): Promise<Response> {
  return respondJson(await loadPilotPlatform(env).getAdminDashboard(getSessionId(request)))
}
async function handleAdminProfile(env: PilotPagesEnv, request: any): Promise<Response> {
  const csrfToken = request.headers.get('x-golden-audit-csrf')
  if (!csrfToken) throw new Error('Invalid request protection token')
  const body = await readJsonBody(request) as AdminProfileBody
  if (!Number.isInteger(body.expectedRevision) || !body.profile || typeof body.profile !== 'object' || Array.isArray(body.profile)) throw new Error('Profile update is invalid')
  const sessionId = getSessionId(request)
  return respondJson(await loadPilotPlatform(env).updateReportPresentationProfile(sessionId, csrfToken, body.expectedRevision, body.profile))
}

async function handleUploadInit(env: PilotPagesEnv, request: any): Promise<Response> {
  const sessionId = getSessionId(request)
  const body = await readJsonBody(request) as UploadInitBody
  const platform = loadPilotPlatform(env)
  const upload = await platform.initializeUpload(sessionId, body.workspaceId)
  return respondJson(upload, 201)
}

async function handleUploadComplete(env: PilotPagesEnv, request: any): Promise<Response> {
  const body = await readJsonBody(request) as UploadCompleteBody
  const platform = loadPilotPlatform(env)
  const upload = await platform.completeUpload({
    uploadId: body.uploadId,
    token: body.token,
    fileName: body.fileName,
    mediaType: body.mediaType,
    bytes: Buffer.from(body.contentBase64, 'base64'),
  })
  return respondJson(upload, 201)
}

function resolveRulesetForJurisdiction(platform: ReturnType<typeof loadPilotPlatform>, jurisdiction: Jurisdiction): string {
  const version = platform.getPublishedRulesetVersionFor(jurisdiction)
  if (!version) throw new Error(`No published ruleset is available for ${jurisdiction}`)
  return version
}

async function handleKickoffAnalysis(env: PilotPagesEnv, request: any, uploadId: string): Promise<Response> {
  const sessionId = getSessionId(request)
  const body = await readJsonBody(request) as AnalysisKickoffBody
  const platform = loadPilotPlatform(env)
  const jurisdiction = normalizeState(body.jurisdiction ?? 'US-CA')
  const report = await platform.parseReport(sessionId, uploadId)
  return respondJson({ status: 'value-review-required', reportId: report.id, required: (await platform.getValueReview(sessionId, report.id)).required, decided: 0 }, 202)
}

async function handleValueReview(env: PilotPagesEnv, request: any, reportId: string): Promise<Response> {
  return respondJson(await loadPilotPlatform(env).getValueReview(getSessionId(request), reportId))
}
async function handleValueDecision(env: PilotPagesEnv, request: any, reportId: string, valueId: string): Promise<Response> {
  const body = await readJsonBody(request) as ReviewValueBody
  return respondJson(await loadPilotPlatform(env).reviewValue(getSessionId(request), reportId, valueId, body))
}
async function handleCompleteValueReview(env: PilotPagesEnv, request: any, reportId: string): Promise<Response> {
  const platform = loadPilotPlatform(env)
  await platform.completeReview(getSessionId(request), reportId)
  const matches = await platform.proposeMatches(getSessionId(request), reportId)
  const unresolved = matches.filter(match => match.state !== 'confirmed' && match.state !== 'rejected')
  if (unresolved.length > 0) return respondJson({ status: 'match-review-required', reportId, matches }, 202)
  return respondJson({ status: 'review-complete', reportId, matches }, 201)
}

async function handleMatchDecision(env: PilotPagesEnv, request: any, matchId: string): Promise<Response> {
  const sessionId = getSessionId(request)
  const body = await readJsonBody(request) as MatchDecisionBody
  const platform = loadPilotPlatform(env)
  const match = await platform.decideMatch(sessionId, matchId, body.action, body.reason)
  return respondJson(match)
}

async function handleMatchSubgroup(env: PilotPagesEnv, request: any, matchId: string): Promise<Response> {
  const sessionId = getSessionId(request)
  const body = await readJsonBody(request) as MatchSubgroupBody
  const platform = loadPilotPlatform(env)
  const match = await platform.confirmMatchSubgroup(sessionId, matchId, body.tradelineIds, body.reason)
  return respondJson(match, 201)
}

async function handleCompleteAnalysis(env: PilotPagesEnv, request: any, reportId: string): Promise<Response> {
  const sessionId = getSessionId(request)
  const body = await readJsonBody(request) as CompleteAnalysisBody
  const platform = loadPilotPlatform(env)
  const jurisdiction = normalizeState(body.jurisdiction ?? 'US-CA')
  const analysis = await platform.runAnalysis(sessionId, reportId, resolveRulesetForJurisdiction(platform, jurisdiction), jurisdiction)
  const consumerReport = await platform.createConsumerReport(sessionId, analysis.id)
  const exportArtifact = await platform.createExport(sessionId, consumerReport.id)
  return respondJson({ status: 'analysis-complete', reportId, analysisId: analysis.id, consumerReportId: consumerReport.id, exportId: exportArtifact.id }, 201)
}

async function handleGetAnalysis(env: PilotPagesEnv, request: any, analysisId: string): Promise<Response> {
  const sessionId = getSessionId(request)
  const platform = loadPilotPlatform(env)
  return respondJson(await platform.getAnalysis(sessionId, analysisId))
}
async function handleGetConsumerReport(env: PilotPagesEnv, request: any, consumerReportId: string): Promise<Response> {
  const sessionId = getSessionId(request)
  const platform = loadPilotPlatform(env)
  return respondJson(await platform.getConsumerReport(sessionId, consumerReportId))
}
async function handleGetExport(env: PilotPagesEnv, request: any, exportId: string): Promise<Response> {
  const sessionId = getSessionId(request)
  const platform = loadPilotPlatform(env)
  return respondJson(await platform.getExport(sessionId, exportId))
}

/** D5: the consumer's written-in deletion promise (AUTHORIZATION_TEXT) was previously
 *  unenforceable — requestDeletion existed but no route ever called it. */
async function handleDeletion(env: PilotPagesEnv, request: any): Promise<Response> {
  const sessionId = getSessionId(request)
  const platform = loadPilotPlatform(env)
  const receipt = await platform.requestDeletion(sessionId)
  return respondJson(receipt, 201, { 'set-cookie': clearSessionCookieHeader(request) })
}

async function handlePasswordResetRequest(env: PilotPagesEnv, request: any): Promise<Response> {
  await enforceAuthRateLimit(env, request)
  const body = await readJsonBody(request) as PasswordResetRequestBody
  const platform = loadPilotPlatform(env)
  const result = await platform.requestPasswordReset(body.email)
  if (result) {
    try { await loadConsumerEmailSender(env).sendPasswordReset(result) } catch { /* Preserve the enumeration-safe response; operators monitor provider delivery failures. */ }
  }
  return respondJson({ status: 'if-account-exists-reset-issued' }, 200)
}
async function handlePasswordResetConfirm(env: PilotPagesEnv, request: any): Promise<Response> {
  const body = await readJsonBody(request) as PasswordResetConfirmBody
  const platform = loadPilotPlatform(env)
  await platform.resetPassword(body.token, body.newPassword)
  return respondJson({ status: 'password-reset' }, 200, { 'set-cookie': clearSessionCookieHeader(request) })
}
async function handleEmailVerificationRequest(env: PilotPagesEnv, request: any): Promise<Response> {
  const sessionId = getSessionId(request)
  const platform = loadPilotPlatform(env)
  const result = await platform.requestEmailVerification(sessionId)
  await loadConsumerEmailSender(env).sendEmailVerification(result)
  return respondJson({ status: 'verification-issued' }, 200)
}
async function handleVerifyEmail(env: PilotPagesEnv, request: any): Promise<Response> {
  const body = await readJsonBody(request) as VerifyEmailBody
  const platform = loadPilotPlatform(env)
  await platform.verifyEmail(body.token)
  return respondJson({ status: 'email-verified' }, 200)
}

function assertSameOriginMutation(request: any): void {
  if (request.method !== 'POST') return
  const origin = request.headers.get('origin')
  if (!origin || origin !== new URL(request.url).origin) throw new Error('Invalid request origin')
}

async function route(context: { request: any; env: PilotPagesEnv }): Promise<Response> {
  const { request, env } = context
  const path = getPath(request)

  if (request.method === 'GET' && path === '/api/health') {
    return respondJson({ service: 'web', status: 'ok' })
  }

  if (request.method === 'GET' && path === '/api/pilot-availability') {
    const runtime = loadPilotRuntime(env)
    const state = new URL(request.url).searchParams.get('state')?.trim().toUpperCase()
    const normalizedState = state ? normalizeState(state) : undefined
    if (!runtime.scope) return respondJson({ status: 'launch-scope-missing', eligible: false, message: runtime.reason ?? 'Pilot launch scope is not configured.' }, 200)
    return respondJson(buildPilotAvailabilityPayload(runtime.scope, runtime.fixtureOnly, normalizedState), 200)
  }

  if (request.method === 'GET' && path === '/api/onboarding') {
    const runtime = loadPilotRuntime(env)
    return respondJson({
      service: 'pages-functions',
      onboarding: buildPilotOnboardingPayload(runtime.scope, runtime.scope?.availabilityClaim ?? 'Pilot is unavailable for consumer processing.', runtime.fixtureOnly),
      ready: runtime.ready,
      ...(runtime.reason ? { reason: runtime.reason } : {}),
    })
  }

  // Diagnostics above remain available in fixture/unready deployments. All consumer or admin
  // state and consumer-data routes fail closed until the same runtime configuration passes the
  // platform approval gate.
  if (!loadPilotRuntime(env).ready) return respondJson({ error: 'Pilot is unavailable for consumer processing' }, 503)
  assertSameOriginMutation(request)

  if (request.method === 'GET' && path === '/api/admin/dashboard') return handleAdminDashboard(env, request)
  if (request.method === 'POST' && path === '/api/admin/profile') return handleAdminProfile(env, request)
  if (request.method === 'GET' && path === '/api/consumer/disclosures') return handleDisclosure(env)
  if (request.method === 'GET' && path === '/api/consumer/dashboard') return handleDashboard(env, request)
  if (request.method === 'POST' && path === '/api/consumer/register') return handleRegister(env, request)
  if (request.method === 'POST' && path === '/api/consumer/sign-in') return handleSignIn(env, request)
  if (request.method === 'POST' && path === '/api/consumer/sign-out') return handleSignOut(env, request)
  if (request.method === 'POST' && path === '/api/consumer/password-reset/request') return handlePasswordResetRequest(env, request)
  if (request.method === 'POST' && path === '/api/consumer/password-reset/confirm') return handlePasswordResetConfirm(env, request)
  if (request.method === 'POST' && path === '/api/consumer/email-verification/request') return handleEmailVerificationRequest(env, request)
  if (request.method === 'POST' && path === '/api/consumer/email-verification/confirm') return handleVerifyEmail(env, request)
  if (request.method === 'POST' && path === '/api/consumer/consent') return handleConsent(env, request)
  if (request.method === 'POST' && path === '/api/consumer/authorization') return handleAuthorization(env, request)
  if (request.method === 'POST' && path === '/api/consumer/uploads/init') return handleUploadInit(env, request)
  if (request.method === 'POST' && path === '/api/consumer/uploads/complete') return handleUploadComplete(env, request)
  if (request.method === 'POST' && path === '/api/consumer/deletion') return handleDeletion(env, request)

  let match = matchPrefix(path, /^\/api\/consumer\/reports\/([^/]+)\/value-review$/)
  if (request.method === 'GET' && match) return handleValueReview(env, request, match[1] ?? '')
  if (request.method === 'POST' && match) return handleCompleteValueReview(env, request, match[1] ?? '')
  match = matchPrefix(path, /^\/api\/consumer\/reports\/([^/]+)\/values\/([^/]+)\/decision$/)
  if (request.method === 'POST' && match) return handleValueDecision(env, request, match[1] ?? '', match[2] ?? '')
  match = matchPrefix(path, /^\/api\/consumer\/uploads\/([^/]+)\/kickoff-analysis$/)
  if (request.method === 'POST' && match) return handleKickoffAnalysis(env, request, match[1] ?? '')
  match = matchPrefix(path, /^\/api\/consumer\/matches\/([^/]+)\/decision$/)
  if (request.method === 'POST' && match) return handleMatchDecision(env, request, match[1] ?? '')
  match = matchPrefix(path, /^\/api\/consumer\/matches\/([^/]+)\/confirm-subgroup$/)
  if (request.method === 'POST' && match) return handleMatchSubgroup(env, request, match[1] ?? '')
  match = matchPrefix(path, /^\/api\/consumer\/reports\/([^/]+)\/complete-analysis$/)
  if (request.method === 'POST' && match) return handleCompleteAnalysis(env, request, match[1] ?? '')
  match = matchPrefix(path, /^\/api\/consumer\/analyses\/([^/]+)$/)
  if (request.method === 'GET' && match) return handleGetAnalysis(env, request, match[1] ?? '')
  match = matchPrefix(path, /^\/api\/consumer\/reports\/([^/]+)$/)
  if (request.method === 'GET' && match) return handleGetConsumerReport(env, request, match[1] ?? '')
  match = matchPrefix(path, /^\/api\/consumer\/exports\/([^/]+)$/)
  if (request.method === 'GET' && match) return handleGetExport(env, request, match[1] ?? '')

  if (request.method === 'GET' && path === '/api/consumer/health') {
    return respondJson({ service: 'consumer', status: 'ok' })
  }

  return respondJson({ error: 'Not found' }, 404) as any
}

export const onRequest: PagesFunction<PilotPagesEnv> = async context => {
  try {
    return await route(context)
  } catch (error) {
    if (error instanceof RateLimitedError) return respondJson({ error: error.message }, 429)
    const message = error instanceof Error ? error.message : 'Unexpected error'
    return respondJson({ error: message }, 400)
  }
}
