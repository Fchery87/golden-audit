import type { PagesFunction } from '@cloudflare/workers-types'
import { createRuntimeEvent } from '../../../../../packages/domain/src/index.js'
import { type Jurisdiction, type MatchGroup } from '../../../../../packages/platform/src/index.js'
import { persistPilotPlatform, persistUpload, loadPilotPlatform, type PilotPagesEnv } from '../_platform.js'
import { buildPilotAvailabilityPayload, buildPilotOnboardingPayload } from '../../../src/pilot-state.js'

type JsonRecord = Record<string, unknown>

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
type CompleteAnalysisBody = { jurisdiction?: string }

function respondJson(body: unknown, status = 200): any {
  return new globalThis.Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  })
}

async function readJsonBody(request: any): Promise<JsonRecord> {
  const parsed: unknown = await request.json()
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('JSON body must be an object')
  return parsed as JsonRecord
}

function getSessionId(request: any): string {
  const value = request.headers.get('x-session-id')?.trim()
  if (!value) throw new Error('x-session-id header is required')
  return value
}

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
  const body = await readJsonBody(request) as ConsumerRegisterBody
  const platform = await loadPilotPlatform(env)
  const account = platform.register({ email: body.email, password: body.password })
  await persistPilotPlatform(env, platform)
  return respondJson({ sessionId: account.sessionId, userId: account.userId, launchScope: platform.getLaunchScope(), onboarding: buildPilotOnboardingPayload(platform.getLaunchScope(), 'Pilot currently limited to approved pilot states only.', true) }, 201)
}

async function handleConsent(env: PilotPagesEnv, request: any): Promise<Response> {
  const sessionId = getSessionId(request)
  const body = await readJsonBody(request) as ConsumerConsentBody
  const platform = await loadPilotPlatform(env)
  const workspace = platform.recordConsent(sessionId, {
    version: body.version,
    adultUSConsumer: body.adultUSConsumer,
    authorizedReportUse: body.authorizedReportUse,
    educationalLimitations: body.educationalLimitations,
    sensitiveDataHandling: body.sensitiveDataHandling,
    residence: normalizeState(body.residence),
    analysisJurisdiction: normalizeState(body.analysisJurisdiction),
  })
  await persistPilotPlatform(env, platform)
  return respondJson({ workspaceId: workspace.id, createdAt: workspace.createdAt, launchScope: platform.getLaunchScope() }, 201)
}

async function handleAuthorization(env: PilotPagesEnv, request: any): Promise<Response> {
  const sessionId = getSessionId(request)
  const platform = await loadPilotPlatform(env)
  const authorization = platform.acceptAuthorization(sessionId)
  await persistPilotPlatform(env, platform)
  return respondJson(authorization, 201)
}

async function handleUploadInit(env: PilotPagesEnv, request: any): Promise<Response> {
  const sessionId = getSessionId(request)
  const body = await readJsonBody(request) as UploadInitBody
  const platform = await loadPilotPlatform(env)
  const upload = platform.initializeUpload(sessionId, body.workspaceId)
  await persistPilotPlatform(env, platform)
  return respondJson(upload, 201)
}

async function handleUploadComplete(env: PilotPagesEnv, request: any): Promise<Response> {
  const body = await readJsonBody(request) as UploadCompleteBody
  const platform = await loadPilotPlatform(env)
  const upload = platform.completeUpload({
    uploadId: body.uploadId,
    token: body.token,
    fileName: body.fileName,
    mediaType: body.mediaType,
    bytes: Buffer.from(body.contentBase64, 'base64'),
  })
  await persistUpload(env, upload.id, upload.mediaType ?? body.mediaType, body.fileName, Buffer.from(body.contentBase64, 'base64'))
  await persistPilotPlatform(env, platform)
  return respondJson(upload, 201)
}

function resolveRulesetForJurisdiction(platform: Awaited<ReturnType<typeof loadPilotPlatform>>, jurisdiction: Jurisdiction): string {
  const published = platform.exportSnapshot().publishedRulesets
  const ruleset = published.find(([, rules]) => rules.some(rule => rule.jurisdiction === jurisdiction))
  if (!ruleset) throw new Error(`No published ruleset is available for ${jurisdiction}`)
  return ruleset[0]
}

async function handleKickoffAnalysis(env: PilotPagesEnv, request: any, uploadId: string): Promise<Response> {
  const sessionId = getSessionId(request)
  const body = await readJsonBody(request) as AnalysisKickoffBody
  const platform = await loadPilotPlatform(env)
  const jurisdiction = normalizeState(body.jurisdiction ?? 'US-CA')
  const report = platform.parseReport(sessionId, uploadId)
  platform.completeReview(sessionId, report.id)
  const matches = platform.proposeMatches(sessionId, report.id)
  const updatedMatches: MatchGroup[] = body.autoConfirmSimpleMatches
    ? matches.map(match => match.tradelineIds.length <= 3 ? platform.decideMatch(sessionId, match.id, 'confirmed', 'Auto-confirmed simple pilot match') : match)
    : matches
  const unresolved = updatedMatches.filter(match => match.state !== 'confirmed' && match.state !== 'rejected')
  if (unresolved.length > 0) {
    await persistPilotPlatform(env, platform)
    return respondJson({ status: 'match-review-required', reportId: report.id, matches: updatedMatches, tradelines: report.tradelines.map(line => ({ id: line.id, bureau: String(line.creditor.bureau), creditor: line.creditor.normalized ?? '', maskedAccount: line.maskedAccount.normalized ?? '', balanceCents: line.balance.normalized ?? null })) }, 202)
  }
  const analysis = platform.runAnalysis(sessionId, report.id, resolveRulesetForJurisdiction(platform, jurisdiction), jurisdiction)
  const consumerReport = platform.createConsumerReport(sessionId, analysis.id)
  const exportArtifact = platform.createExport(sessionId, consumerReport.id)
  await persistPilotPlatform(env, platform)
  return respondJson({ status: 'analysis-complete', reportId: report.id, matches: updatedMatches, analysisId: analysis.id, consumerReportId: consumerReport.id, exportId: exportArtifact.id }, 201)
}

async function handleMatchDecision(env: PilotPagesEnv, request: any, matchId: string): Promise<Response> {
  const sessionId = getSessionId(request)
  const body = await readJsonBody(request) as MatchDecisionBody
  const platform = await loadPilotPlatform(env)
  const match = platform.decideMatch(sessionId, matchId, body.action, body.reason)
  await persistPilotPlatform(env, platform)
  return respondJson(match)
}

async function handleMatchSubgroup(env: PilotPagesEnv, request: any, matchId: string): Promise<Response> {
  const sessionId = getSessionId(request)
  const body = await readJsonBody(request) as MatchSubgroupBody
  const platform = await loadPilotPlatform(env)
  const match = platform.confirmMatchSubgroup(sessionId, matchId, body.tradelineIds, body.reason)
  await persistPilotPlatform(env, platform)
  return respondJson(match, 201)
}

async function handleCompleteAnalysis(env: PilotPagesEnv, request: any, reportId: string): Promise<Response> {
  const sessionId = getSessionId(request)
  const body = await readJsonBody(request) as CompleteAnalysisBody
  const platform = await loadPilotPlatform(env)
  const jurisdiction = normalizeState(body.jurisdiction ?? 'US-CA')
  const analysis = platform.runAnalysis(sessionId, reportId, resolveRulesetForJurisdiction(platform, jurisdiction), jurisdiction)
  const consumerReport = platform.createConsumerReport(sessionId, analysis.id)
  const exportArtifact = platform.createExport(sessionId, consumerReport.id)
  await persistPilotPlatform(env, platform)
  return respondJson({ status: 'analysis-complete', reportId, analysisId: analysis.id, consumerReportId: consumerReport.id, exportId: exportArtifact.id }, 201)
}

export const onRequest: PagesFunction<PilotPagesEnv> = async context => {
  const { request, env } = context
  const path = getPath(request)

  if (request.method === 'GET' && path === '/api/health') {
    return respondJson({ service: 'web', status: 'ok' })
  }

  if (request.method === 'GET' && path === '/api/pilot-availability') {
    const platform = await loadPilotPlatform(env)
    const launchScope = platform.getLaunchScope()
    const state = new URL(request.url).searchParams.get('state')?.trim().toUpperCase()
    const normalizedState = state ? normalizeState(state) : undefined
    return respondJson(buildPilotAvailabilityPayload(launchScope, true, normalizedState), 200)
  }

  if (request.method === 'GET' && path === '/api/onboarding') {
    const platform = await loadPilotPlatform(env)
    return respondJson({ service: 'pages-functions', onboarding: buildPilotOnboardingPayload(platform.getLaunchScope(), 'Pilot currently limited to approved pilot states only.', true) })
  }

  if (request.method === 'POST' && path === '/api/consumer/register') return handleRegister(env, request)
  if (request.method === 'POST' && path === '/api/consumer/consent') return handleConsent(env, request)
  if (request.method === 'POST' && path === '/api/consumer/authorization') return handleAuthorization(env, request)
  if (request.method === 'POST' && path === '/api/consumer/uploads/init') return handleUploadInit(env, request)
  if (request.method === 'POST' && path === '/api/consumer/uploads/complete') return handleUploadComplete(env, request)

  let match = matchPrefix(path, /^\/api\/consumer\/uploads\/([^/]+)\/kickoff-analysis$/)
  if (request.method === 'POST' && match) return handleKickoffAnalysis(env, request, match[1] ?? '')
  match = matchPrefix(path, /^\/api\/consumer\/matches\/([^/]+)\/decision$/)
  if (request.method === 'POST' && match) return handleMatchDecision(env, request, match[1] ?? '')
  match = matchPrefix(path, /^\/api\/consumer\/matches\/([^/]+)\/confirm-subgroup$/)
  if (request.method === 'POST' && match) return handleMatchSubgroup(env, request, match[1] ?? '')
  match = matchPrefix(path, /^\/api\/consumer\/reports\/([^/]+)\/complete-analysis$/)
  if (request.method === 'POST' && match) return handleCompleteAnalysis(env, request, match[1] ?? '')

  if (request.method === 'GET' && path === '/api/consumer/health') {
    return respondJson({ service: 'consumer', status: 'ok' })
  }

  return respondJson({ error: 'Not found' }, 404) as any
}
