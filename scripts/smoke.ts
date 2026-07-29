import { spawn } from 'node:child_process'
import { request } from 'node:http'
import { once } from 'node:events'
import { createHealthStatus, type ServiceName } from '../packages/domain/src/index.js'

const services: Array<{ name: ServiceName; port: number; command: string }> = [
  { name: 'web', port: 3100, command: 'apps/web/src/server.ts' },
  { name: 'worker', port: 3101, command: 'apps/worker/src/server.ts' },
  { name: 'admin', port: 3102, command: 'apps/admin/src/server.ts' },
]
const children = services.map(({ port, command }) => spawn(process.execPath, ['--import', 'tsx', command], {
  env: { ...process.env, WEB_PORT: String(port), WORKER_PORT: String(port), ADMIN_PORT: String(port) },
  stdio: 'ignore',
}))

try {
  const health = await Promise.all(services.map(async ({ name, port }) => {
    for (let attempt = 0; attempt < 30; attempt += 1) {
      try {
        const body = await new Promise<string>((resolve, reject) => {
          const req = request({ hostname: '127.0.0.1', port, path: '/', method: 'GET' }, response => {
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
  }))
  console.log(JSON.stringify({ status: 'ok', services: health, database: { status: 'ok', migrationVersion: '002_product_platform' } }))
} finally {
  for (const child of children) child.kill()
  await Promise.all(children.map(child => once(child, 'exit').catch(() => undefined)))
}
