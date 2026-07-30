import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { once } from 'node:events'
import { request } from 'node:http'

function getJson<T>(port: number, path: string): Promise<{ statusCode: number; body: T }> {
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

function getText(port: number, path: string): Promise<{ statusCode: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = request({ hostname: '127.0.0.1', port, path, method: 'GET' }, response => {
      let data = ''
      response.setEncoding('utf8')
      response.on('data', chunk => { data += chunk })
      response.on('end', () => resolve({ statusCode: response.statusCode ?? 0, body: data }))
    })
    req.on('error', reject)
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

test('admin boundary exposes pilot evidence page and JSON feed', async () => {
  const port = 3202
  const persistenceDir = mkdtempSync(join(tmpdir(), 'golden-audit-admin-'))
  const child = spawn(process.execPath, ['--import', 'tsx', 'apps/admin/src/server.ts'], {
    env: { ...process.env, ADMIN_PORT: String(port), PILOT_PERSISTENCE_DIR: persistenceDir },
    stdio: 'ignore',
  })

  try {
    await waitForServer(port)

    const root = await getText(port, '/')
    assert.equal(root.statusCode, 200)
    assert.match(root.body, /Pilot evidence/)

    const evidence = await getJson<{ gate: { ready: boolean }; quality: { segments: unknown[] }; drills: { totalDrills: number } }>(port, '/pilot-evidence')
    assert.equal(typeof evidence.body.gate.ready, 'boolean')
    assert.ok(Array.isArray(evidence.body.quality.segments))
    assert.equal(evidence.body.drills.totalDrills >= 0, true)
  } finally {
    child.kill()
    await once(child, 'exit').catch(() => undefined)
    rmSync(persistenceDir, { recursive: true, force: true })
  }
})
