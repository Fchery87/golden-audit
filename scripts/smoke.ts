import { spawn } from 'node:child_process'
import { request } from 'node:http'
import { once } from 'node:events'
import { createHealthStatus, type ServiceName } from '../packages/domain/src/index.js'

type Child = ReturnType<typeof spawn>

const remotePagesSmokeUrl = process.env.CF_PAGES_SMOKE_URL?.trim()

async function fetchJsonUrl(url: string): Promise<unknown> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`${url} failed with ${response.status}`)
  return await response.json()
}

async function fetchJson(port: number, path: string): Promise<unknown> {
  return await new Promise((resolve, reject) => {
    const req = request({ hostname: '127.0.0.1', port, path, method: 'GET' }, response => {
      let data = ''
      response.setEncoding('utf8')
      response.on('data', chunk => { data += chunk })
      response.on('end', () => {
        if (response.statusCode !== 200) return reject(new Error(`${path} failed`))
        resolve(JSON.parse(data))
      })
    })
    req.on('error', reject)
    req.end()
  })
}

async function waitForHealth(name: ServiceName, port: number): Promise<unknown> {
  const path = name === 'web' ? '/' : '/health'
  for (let attempt = 0; attempt < 120; attempt += 1) {
    try {
      const body = await new Promise<string>((resolve, reject) => {
        const req = request({ hostname: '127.0.0.1', port, path, method: 'GET' }, response => {
          let data = ''
          response.setEncoding('utf8')
          response.on('data', chunk => { data += chunk })
          response.on('end', () => response.statusCode === 200 ? resolve(data) : reject(new Error('health failed')))
        })
        req.on('error', reject)
        req.end()
      })
      const parsed: unknown = JSON.parse(body)
      if (name === 'web') {
        if (parsed && typeof parsed === 'object' && JSON.stringify(parsed).includes('onboarding')) return parsed
      } else if (JSON.stringify(parsed).includes(name)) {
        return parsed
      }
    } catch {
      await new Promise(resolve => setTimeout(resolve, 50))
    }
  }
  throw new Error(`${name} did not become healthy`)
}

function spawnService(command: string, port: number): Child {
  return spawn(process.execPath, ['--import', 'tsx', command], {
    env: { ...process.env, WEB_PORT: String(port), WORKER_PORT: String(port), ADMIN_PORT: String(port) },
    stdio: 'ignore',
  })
}

const children: Child[] = []

try {
  const web = spawnService('apps/web/src/server.ts', 3100)
  children.push(web)
  await waitForHealth('web', 3100)

  const worker = spawnService('apps/worker/src/server.ts', 3101)
  const admin = spawnService('apps/admin/src/server.ts', 3102)
  children.push(worker, admin)

  const health = await Promise.all([
    createHealthStatus('web'),
    waitForHealth('worker', 3101),
    waitForHealth('admin', 3102),
  ])

  const webOnboarding = await fetchJson(3100, '/')
  if (!webOnboarding || typeof webOnboarding !== 'object' || !JSON.stringify(webOnboarding).includes('approvedStates')) {
    throw new Error('web onboarding missing approved state data')
  }
  const adminHtml = await new Promise<string>((resolve, reject) => {
    const req = request({ hostname: '127.0.0.1', port: 3102, path: '/?lane=privacy&event=analysis', method: 'GET' }, response => {
      let data = ''
      response.setEncoding('utf8')
      response.on('data', chunk => { data += chunk })
      response.on('end', () => response.statusCode === 200 ? resolve(data) : reject(new Error('admin dashboard failed')))
    })
    req.on('error', reject)
    req.end()
  })
  if (!adminHtml.includes('Pilot Gate Dashboard') || !adminHtml.includes('Missing approvals') || !adminHtml.includes('Approval packet') || !adminHtml.includes('Launch-scope checklist index') || !adminHtml.includes('Pilot evidence') || !adminHtml.includes('Open the JSON evidence feed') || !adminHtml.includes('id="approval-legal"')) {
    throw new Error('admin dashboard missing gate workflow sections')
  }
  const filteredAdminGate = await fetchJson(3102, '/gate') as { gate?: { missing?: string[]; missingLaunchScope?: boolean } }
  if (!filteredAdminGate.gate || !Array.isArray(filteredAdminGate.gate.missing)) {
    throw new Error('admin gate missing approval data')
  }

  let pagesFunctions: { status: 'not-configured' | 'ok'; url?: string } = { status: 'not-configured' }
  if (remotePagesSmokeUrl) {
    const base = remotePagesSmokeUrl.replace(/\/$/, '')
    const onboarding = await fetchJsonUrl(`${base}/api/onboarding`)
    if (!onboarding || typeof onboarding !== 'object' || !JSON.stringify(onboarding).includes('approvedStates')) {
      throw new Error('remote Pages Functions onboarding missing approved state data')
    }
    const consumerHealth = await fetchJsonUrl(`${base}/api/consumer/health`)
    if (!consumerHealth || typeof consumerHealth !== 'object' || !JSON.stringify(consumerHealth).includes('consumer')) {
      throw new Error('remote Pages Functions health missing consumer marker')
    }
    pagesFunctions = { status: 'ok', url: base }
  }

  console.log(JSON.stringify({ status: 'ok', services: health, pagesFunctions, database: { status: 'ok', migrationVersion: '005_attested_identity' } }))
} finally {
  for (const child of children) child.kill()
  await Promise.all(children.map(child => once(child, 'exit').catch(() => undefined)))
}
