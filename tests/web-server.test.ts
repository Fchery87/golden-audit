import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { request } from 'node:http'

type JsonResponse<T> = { statusCode: number; body: T }

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
  sessionId: string
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
  matches: Array<{ state: string; confidence: number; tradelineIds: string[] }>
  analysisId?: string
  consumerReportId?: string
  exportId?: string
}

function getJson<T>(port: number, path: string): Promise<JsonResponse<T>> {
  return new Promise((resolve, reject) => {
    const req = request({ hostname: '127.0.0.1', port, path, method: 'GET' }, response => {
      let data = ''
      response.setEncoding('utf8')
      response.on('data', chunk => { data += chunk })
      response.on('end', () => {
        try {
          resolve({ statusCode: response.statusCode ?? 0, body: JSON.parse(data) as T })
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
          resolve({ statusCode: response.statusCode ?? 0, body: JSON.parse(data) as T })
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
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await getJson<{ status: string }>(port, '/health')
      if (response.statusCode === 200) return
    } catch {
      await new Promise(resolve => setTimeout(resolve, 50))
    }
  }
  throw new Error(`server on ${port} did not become healthy`)
}

test('web boundary publishes approved-state onboarding and pilot availability from launch scope fixtures', async () => {
  const port = 3199
  const child = spawn(process.execPath, ['--import', 'tsx', 'apps/web/src/server.ts'], {
    env: { ...process.env, WEB_PORT: String(port) },
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
  }
})

test('web boundary supports the smallest real consumer pilot flow through analysis completion', async () => {
  const port = 3200
  const child = spawn(process.execPath, ['--import', 'tsx', 'apps/web/src/server.ts'], {
    env: { ...process.env, WEB_PORT: String(port) },
    stdio: 'ignore',
  })

  try {
    await waitForServer(port)

    const register = await postJson<RegisterResponse>(port, '/consumer/register', {
      email: 'api-consumer@example.com',
      password: 'correct horse battery staple',
    })
    assert.equal(register.statusCode, 201)
    assert.match(register.body.sessionId, /[0-9a-f-]{36}/i)

    const sessionHeader = { 'x-session-id': register.body.sessionId }

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

    const authorization = await postJson<AuthorizationResponse>(port, '/consumer/authorization', {}, sessionHeader)
    assert.equal(authorization.statusCode, 201)
    assert.match(authorization.body.id, /[0-9a-f-]{36}/i)
    assert.equal(authorization.body.version, 'authorization-2026-01')

    const uploadInit = await postJson<UploadInitResponse>(port, '/consumer/uploads/init', {
      workspaceId: consent.body.workspaceId,
    }, sessionHeader)
    assert.equal(uploadInit.statusCode, 201)
    assert.equal(uploadInit.body.stage, 'initialized')

    const syntheticReport = {
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
      tradelines: [
        { bureau: 'equifax', creditor: 'Example Bank', account: '12345678', accountType: 'revolving', balance: 12500, status: 'open', opened: '2020-01', updated: '2026-06-30' },
        { bureau: 'experian', creditor: 'Example Bank', account: '12345678', accountType: 'revolving', balance: 15000, status: 'open', opened: '2020-01', updated: '2026-06-28' },
      ],
    }

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
  } finally {
    child.kill()
    await once(child, 'exit').catch(() => undefined)
  }
})
