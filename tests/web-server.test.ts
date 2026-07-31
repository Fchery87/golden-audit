import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { once } from 'node:events'
import { request, type IncomingHttpHeaders } from 'node:http'
import { resolveRuntimeDbPath, SqlitePlatformStore } from '../apps/web/src/runtime-store.js'
import { randomInviteCode } from '../packages/platform/src/index.js'

type JsonResponse<T> = { statusCode: number; body: T; headers: IncomingHttpHeaders }

/** D10: mints a single-use invite code directly against the spawned server's SQLite file — the
 *  same thing scripts/issue-invite.ts does for a real operator. There is deliberately no public
 *  HTTP endpoint for this (that would defeat invite-only), so an integration test has to seed it
 *  the same way an operator would, not through the API. */
async function issueInviteFor(persistenceDir: string): Promise<string> {
  const store = new SqlitePlatformStore(resolveRuntimeDbPath(persistenceDir))
  const code = randomInviteCode()
  await store.createInvite(code, new Date().toISOString())
  store.close()
  return code
}

/** D10: sessions travel as an httpOnly cookie now, not an x-session-id header. Extracts the
 *  cookie pair from a Set-Cookie response header so subsequent requests can send it back. */
function sessionCookieFrom(headers: IncomingHttpHeaders): Record<string, string> {
  const setCookie = headers['set-cookie']
  const raw = Array.isArray(setCookie) ? setCookie[0] : setCookie
  const pair = raw?.split(';')[0]
  return pair ? { cookie: pair } : {}
}

type RootResponse = {
  service: string
  onboarding: {
    approvedStates: string[]
    provisionalSelectedState: string | null
    availabilityClaim: string
    fixtureOnly: boolean
  }
}

type RegisterResponse = {
  userId: string
}

type ConsentResponse = {
  workspaceId: string
}

type AuthorizationResponse = {
  id: string
  version: string
}

type UploadInitResponse = {
  id: string
  token: string
  stage: string
}

type UploadCompleteResponse = {
  id: string
  stage: string
  mediaType: string
}

type KickoffResponse = {
  status: 'analysis-complete' | 'match-review-required'
  reportId: string
  matches: Array<{ id: string; state: string; confidence: number; tradelineIds: string[]; signals: string[] }>
  tradelines?: Array<{ id: string; creditor: string; maskedAccount: string; bureau: string; balanceCents: number | null }>
  analysisId?: string
  consumerReportId?: string
  exportId?: string
}

type AnalysisResponse = {
  id: string
  reportId: string
  findings: Array<{ id: string; title: string }>
}

type ConsumerReportResponse = {
  id: string
  analysisId: string
  findings: Array<{ id: string }>
  limitations: string[]
}

type ExportResponse = {
  id: string
  reportId: string
  content: string
}

function getJson<T>(port: number, path: string, headers: Record<string, string> = {}): Promise<JsonResponse<T>> {
  return new Promise((resolve, reject) => {
    const req = request({ hostname: '127.0.0.1', port, path, method: 'GET', headers }, response => {
      let data = ''
      response.setEncoding('utf8')
      response.on('data', chunk => { data += chunk })
      response.on('end', () => {
        try {
          resolve({ statusCode: response.statusCode ?? 0, body: JSON.parse(data) as T, headers: response.headers })
        } catch (error) {
          reject(error)
        }
      })
    })
    req.on('error', reject)
    req.end()
  })
}

function postJson<T>(port: number, path: string, body: unknown, headers: Record<string, string> = {}): Promise<JsonResponse<T>> {
  return new Promise((resolve, reject) => {
    const serialized = JSON.stringify(body)
    const req = request({
      hostname: '127.0.0.1',
      port,
      path,
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(serialized).toString(),
        ...headers,
      },
    }, response => {
      let data = ''
      response.setEncoding('utf8')
      response.on('data', chunk => { data += chunk })
      response.on('end', () => {
        try {
          resolve({ statusCode: response.statusCode ?? 0, body: JSON.parse(data) as T, headers: response.headers })
        } catch (error) {
          reject(error)
        }
      })
    })
    req.on('error', reject)
    req.write(serialized)
    req.end()
  })
}

async function waitForServer(port: number): Promise<void> {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    try {
      const response = await getJson<{ status: string }>(port, '/health')
      if (response.statusCode === 200) return
    } catch {
      await new Promise(resolve => setTimeout(resolve, 50))
    }
  }
  throw new Error(`server on ${port} did not become healthy`)
}

function makeSyntheticReport(tradelines: Array<Record<string, unknown>>) {
  return {
    provider: 'synthetic-provider',
    template: 'pilot-v1',
    reportDate: '2026-07-01',
    identity: ['A Consumer'],
    addresses: ['1 Main St'],
    employers: [],
    inquiries: ['Example Bank 2026-06'],
    publicRecords: [],
    scores: [700],
    remarks: [],
    tradelines,
  }
}

test('web boundary publishes approved-state onboarding and pilot availability from launch scope fixtures', async () => {
  const port = 3199
  const persistenceDir = mkdtempSync(join(tmpdir(), 'golden-audit-web-'))
  const child = spawn(process.execPath, ['--import', 'tsx', 'apps/web/src/server.ts'], {
    env: { ...process.env, WEB_PORT: String(port), PILOT_PERSISTENCE_DIR: persistenceDir },
    stdio: 'ignore',
  })

  try {
    await waitForServer(port)

    const root = (await getJson<RootResponse>(port, '/')).body
    assert.equal(root.service, 'web')
    assert.deepEqual(root.onboarding.approvedStates, ['US-CA'])
    assert.equal(root.onboarding.provisionalSelectedState, 'US-CA')
    assert.equal(root.onboarding.fixtureOnly, true)
    assert.match(root.onboarding.availabilityClaim, /approved pilot states/i)

    const california = (await getJson<{ eligible: boolean; approvedStates: string[]; stateChecked: string | null; boundary: string }>(port, '/pilot-availability?state=CA')).body
    assert.equal(california.eligible, true)
    assert.deepEqual(california.approvedStates, ['US-CA'])
    assert.equal(california.stateChecked, 'US-CA')
    assert.match(california.boundary, /educational analysis only/i)

    const newYork = (await getJson<{ eligible: boolean; stateChecked: string | null; blockedStateMessage: string }>(port, '/pilot-availability?state=NY')).body
    assert.equal(newYork.eligible, false)
    assert.equal(newYork.stateChecked, 'US-NY')
    assert.match(newYork.blockedStateMessage, /not currently available/i)
  } finally {
    child.kill()
    await once(child, 'exit').catch(() => undefined)
    rmSync(persistenceDir, { recursive: true, force: true })
  }
})

test('web boundary supports the smallest real consumer pilot flow through analysis completion and fetch APIs', async () => {
  const port = 3200
  const persistenceDir = mkdtempSync(join(tmpdir(), 'golden-audit-web-'))
  const child = spawn(process.execPath, ['--import', 'tsx', 'apps/web/src/server.ts'], {
    env: { ...process.env, WEB_PORT: String(port), PILOT_PERSISTENCE_DIR: persistenceDir },
    stdio: 'ignore',
  })

  try {
    await waitForServer(port)

    const inviteCode = await issueInviteFor(persistenceDir)
    const register = await postJson<RegisterResponse>(port, '/consumer/register', {
      email: 'api-consumer@example.com',
      password: 'correct horse battery staple',
      inviteCode,
    })
    assert.equal(register.statusCode, 201)
    assert.match(register.body.userId, /[0-9a-f-]{36}/i)

    const sessionHeader = sessionCookieFrom(register.headers)

    const consent = await postJson<ConsentResponse>(port, '/consumer/consent', {
      version: '2026-01',
      adultUSConsumer: true,
      authorizedReportUse: true,
      educationalLimitations: true,
      sensitiveDataHandling: true,
      residence: 'CA',
      analysisJurisdiction: 'CA',
    }, sessionHeader)
    assert.equal(consent.statusCode, 201)
    assert.match(consent.body.workspaceId, /[0-9a-f-]{36}/i)

    const authorization = await postJson<AuthorizationResponse>(port, '/consumer/authorization', { version: 'authorization-2026-01', accepted: true }, sessionHeader)
    assert.equal(authorization.statusCode, 201)
    assert.match(authorization.body.id, /[0-9a-f-]{36}/i)
    assert.equal(authorization.body.version, 'authorization-2026-01')

    const uploadInit = await postJson<UploadInitResponse>(port, '/consumer/uploads/init', {
      workspaceId: consent.body.workspaceId,
    }, sessionHeader)
    assert.equal(uploadInit.statusCode, 201)
    assert.equal(uploadInit.body.stage, 'initialized')

    const syntheticReport = makeSyntheticReport([
      { bureau: 'equifax', creditor: 'Example Bank', account: '12345678', accountType: 'revolving', balance: 12500, status: 'open', opened: '2020-01', updated: '2026-06-30' },
      { bureau: 'experian', creditor: 'Example Bank', account: '12345678', accountType: 'revolving', balance: 15000, status: 'open', opened: '2020-01', updated: '2026-06-28' },
    ])

    const uploadComplete = await postJson<UploadCompleteResponse>(port, '/consumer/uploads/complete', {
      uploadId: uploadInit.body.id,
      token: uploadInit.body.token,
      fileName: 'report.html',
      mediaType: 'text/html',
      contentBase64: Buffer.from(`<html>GOLDEN-AUDIT-REPORT:${JSON.stringify(syntheticReport)}</body></html>`).toString('base64'),
    })
    assert.equal(uploadComplete.statusCode, 201)
    assert.equal(uploadComplete.body.stage, 'ready-to-parse')
    assert.equal(uploadComplete.body.mediaType, 'text/html')

    const kickoff = await postJson<KickoffResponse>(port, `/consumer/uploads/${uploadComplete.body.id}/kickoff-analysis`, {
      jurisdiction: 'CA',
      autoConfirmSimpleMatches: true,
    }, sessionHeader)
    assert.equal(kickoff.statusCode, 201)
    assert.equal(kickoff.body.status, 'analysis-complete')
    assert.match(kickoff.body.reportId, /[0-9a-f-]{36}/i)
    assert.equal(kickoff.body.matches.length, 1)
    assert.equal(kickoff.body.matches[0]?.state, 'confirmed')
    assert.equal(kickoff.body.matches[0]?.confidence, 0.72)
    assert.match(kickoff.body.analysisId ?? '', /[0-9a-f-]{36}/i)
    assert.match(kickoff.body.consumerReportId ?? '', /[0-9a-f-]{36}/i)
    assert.match(kickoff.body.exportId ?? '', /[0-9a-f-]{36}/i)

    const analysis = await getJson<AnalysisResponse>(port, `/consumer/analyses/${kickoff.body.analysisId}`, sessionHeader)
    assert.equal(analysis.statusCode, 200)
    assert.equal(analysis.body.reportId, kickoff.body.reportId)
    assert.ok(analysis.body.findings.length >= 1)

    const consumerReport = await getJson<ConsumerReportResponse>(port, `/consumer/reports/${kickoff.body.consumerReportId}`, sessionHeader)
    assert.equal(consumerReport.statusCode, 200)
    assert.equal(consumerReport.body.analysisId, kickoff.body.analysisId)
    assert.match(consumerReport.body.limitations.join(' '), /Educational information only/)

    const exportArtifact = await getJson<ExportResponse>(port, `/consumer/exports/${kickoff.body.exportId}`, sessionHeader)
    assert.equal(exportArtifact.statusCode, 200)
    assert.match(exportArtifact.body.content, /Educational information only/)
  } finally {
    child.kill()
    await once(child, 'exit').catch(() => undefined)
    rmSync(persistenceDir, { recursive: true, force: true })
  }
})

test('web boundary supports manual subgroup confirmation for oversized collision sets', async () => {
  const port = 3201
  const persistenceDir = mkdtempSync(join(tmpdir(), 'golden-audit-web-'))
  const child = spawn(process.execPath, ['--import', 'tsx', 'apps/web/src/server.ts'], {
    env: { ...process.env, WEB_PORT: String(port), PILOT_PERSISTENCE_DIR: persistenceDir },
    stdio: 'ignore',
  })

  try {
    await waitForServer(port)

    const inviteCode = await issueInviteFor(persistenceDir)
    const register = await postJson<RegisterResponse>(port, '/consumer/register', {
      email: 'collision@example.com',
      password: 'correct horse battery staple',
      inviteCode,
    })
    const sessionHeader = sessionCookieFrom(register.headers)

    const consent = await postJson<ConsentResponse>(port, '/consumer/consent', {
      version: '2026-01',
      adultUSConsumer: true,
      authorizedReportUse: true,
      educationalLimitations: true,
      sensitiveDataHandling: true,
      residence: 'CA',
      analysisJurisdiction: 'CA',
    }, sessionHeader)
    await postJson<AuthorizationResponse>(port, '/consumer/authorization', { version: 'authorization-2026-01', accepted: true }, sessionHeader)
    const uploadInit = await postJson<UploadInitResponse>(port, '/consumer/uploads/init', { workspaceId: consent.body.workspaceId }, sessionHeader)

    const oversizedReport = makeSyntheticReport([
      { bureau: 'equifax', creditor: 'Store Card', account: '10001234', accountType: 'revolving', balance: 10000, status: 'open', opened: '2020-01', updated: '2026-06-30' },
      { bureau: 'experian', creditor: 'Store Card', account: '20001234', accountType: 'revolving', balance: 10500, status: 'open', opened: '2020-01', updated: '2026-06-28' },
      { bureau: 'transunion', creditor: 'Store Card', account: '30001234', accountType: 'revolving', balance: 10250, status: 'open', opened: '2020-01', updated: '2026-06-27' },
      { bureau: 'equifax', creditor: 'Store Card', account: '40001234', accountType: 'revolving', balance: 10100, status: 'open', opened: '2020-01', updated: '2026-06-26' },
    ])

    const uploadComplete = await postJson<UploadCompleteResponse>(port, '/consumer/uploads/complete', {
      uploadId: uploadInit.body.id,
      token: uploadInit.body.token,
      fileName: 'oversized.html',
      mediaType: 'text/html',
      contentBase64: Buffer.from(`<html>GOLDEN-AUDIT-REPORT:${JSON.stringify(oversizedReport)}</body></html>`).toString('base64'),
    })

    const kickoff = await postJson<KickoffResponse>(port, `/consumer/uploads/${uploadComplete.body.id}/kickoff-analysis`, {
      jurisdiction: 'CA',
      autoConfirmSimpleMatches: false,
    }, sessionHeader)
    assert.equal(kickoff.statusCode, 202)
    assert.equal(kickoff.body.status, 'match-review-required')
    assert.equal(kickoff.body.matches.length, 1)
    assert.equal(kickoff.body.matches[0]?.state, 'split')
    assert.ok(kickoff.body.matches[0]?.signals.includes('collision-set'))
    assert.ok(Array.isArray(kickoff.body.tradelines) && (kickoff.body.tradelines?.length ?? 0) === 4)
    assert.ok(kickoff.body.tradelines?.every(t => typeof t.creditor === 'string' && typeof t.maskedAccount === 'string'))

    const subgroup = await postJson<{ id: string; state: string; tradelineIds: string[] }>(port, `/consumer/matches/${kickoff.body.matches[0]?.id}/confirm-subgroup`, {
      tradelineIds: kickoff.body.matches[0]?.tradelineIds.slice(0, 2) ?? [],
      reason: 'Consumer confirmed subgroup',
    }, sessionHeader)
    assert.equal(subgroup.statusCode, 201)
    assert.equal(subgroup.body.state, 'confirmed')
    assert.equal(subgroup.body.tradelineIds.length, 2)

    const complete = await postJson<{ status: string; analysisId: string; consumerReportId: string; exportId: string }>(
      port,
      `/consumer/reports/${kickoff.body.reportId}/complete-analysis`,
      { jurisdiction: 'CA' },
      sessionHeader,
    )
    assert.equal(complete.statusCode, 201)
    assert.equal(complete.body.status, 'analysis-complete')
    assert.match(complete.body.analysisId, /[0-9a-f-]{36}/i)
    assert.match(complete.body.consumerReportId, /[0-9a-f-]{36}/i)
    assert.match(complete.body.exportId, /[0-9a-f-]{36}/i)
  } finally {
    child.kill()
    await once(child, 'exit').catch(() => undefined)
    rmSync(persistenceDir, { recursive: true, force: true })
  }
})
