import { spawn } from 'node:child_process'
import net from 'node:net'

const services = [
  { name: 'web', port: Number(process.env.WEB_PORT ?? 3000), command: ['--import', 'tsx', 'apps/web/src/server.ts'] },
  { name: 'client', port: Number(process.env.CLIENT_PORT ?? 5173), command: null, npmScript: { cwd: 'apps/web/client', script: 'dev' } },
  { name: 'worker', port: Number(process.env.WORKER_PORT ?? 3001), command: ['--import', 'tsx', 'apps/worker/src/server.ts'] },
  { name: 'admin', port: Number(process.env.ADMIN_PORT ?? 3002), command: ['--import', 'tsx', 'apps/admin/src/server.ts'] },
]

function portInUse(port) {
  return new Promise(resolve => {
    const socket = net.createConnection({ port, host: '127.0.0.1' })
    socket.once('connect', () => {
      socket.end()
      resolve(true)
    })
    socket.once('error', () => resolve(false))
  })
}

const children = []
for (const service of services) {
  const busy = await portInUse(service.port)
  if (busy) {
    console.log(`${service.name} already running on ${service.port}`)
    continue
  }
  const env = {
    ...process.env,
    WEB_PORT: String(services.find(item => item.name === 'web')?.port ?? 3000),
    WORKER_PORT: String(services.find(item => item.name === 'worker')?.port ?? 3001),
    ADMIN_PORT: String(services.find(item => item.name === 'admin')?.port ?? 3002),
  }
  const child = service.npmScript
    ? spawn('npm', ['run', service.npmScript.script], { stdio: 'inherit', cwd: service.npmScript.cwd, env })
    : spawn(process.execPath, service.command, { stdio: 'inherit', env })
  child.on('exit', code => {
    if (code && code !== 0) process.exitCode = code
  })
  children.push(child)
  console.log(`${service.name} starting on ${service.port}`)
}

const clientPort = services.find(item => item.name === 'client')?.port ?? 5173
console.log(`\n  ➜  Open http://localhost:${clientPort} for the consumer UI (Vite HMR)\n      API backend on http://localhost:${services.find(item => item.name === 'web')?.port ?? 3000}\n`)

function shutdown(signal) {
  for (const child of children) child.kill(signal)
}

process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))
