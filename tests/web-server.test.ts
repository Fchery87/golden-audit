import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { request } from 'node:http'

function getJson(port: number, path: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const req = request({ hostname: '127.0.0.1', port, path, method: 'GET' }, response => {
      let data = ''
      response.setEncoding('utf8')
      response.on('data', chunk => { data += chunk })
      response.on('end', () => {
        try {
          resolve(JSON.parse(data))
        } catch (error) {
          reject(error)
        }
      })
    })
    req.on('error', reject)
    req.end()
  })
}

async function waitForServer(port: number): Promise<void> {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      await getJson(port, '/health')
      return
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

    const root = await getJson(port, '/') as {
      service: string
      onboarding: {
        approvedStates: string[]
        provisionalSelectedState: string | null
        availabilityClaim: string
        fixtureOnly: boolean
      }
    }
    assert.equal(root.service, 'web')
    assert.deepEqual(root.onboarding.approvedStates, ['US-CA'])
    assert.equal(root.onboarding.provisionalSelectedState, 'US-CA')
    assert.equal(root.onboarding.fixtureOnly, true)
    assert.match(root.onboarding.availabilityClaim, /approved pilot states/i)

    const california = await getJson(port, '/pilot-availability?state=CA') as {
      eligible: boolean
      approvedStates: string[]
      stateChecked: string | null
      boundary: string
    }
    assert.equal(california.eligible, true)
    assert.deepEqual(california.approvedStates, ['US-CA'])
    assert.equal(california.stateChecked, 'US-CA')
    assert.match(california.boundary, /educational analysis only/i)

    const newYork = await getJson(port, '/pilot-availability?state=NY') as {
      eligible: boolean
      stateChecked: string | null
      blockedStateMessage: string
    }
    assert.equal(newYork.eligible, false)
    assert.equal(newYork.stateChecked, 'US-NY')
    assert.match(newYork.blockedStateMessage, /not currently available/i)
  } finally {
    child.kill()
    await once(child, 'exit').catch(() => undefined)
  }
})
