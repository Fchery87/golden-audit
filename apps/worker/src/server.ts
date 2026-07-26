import { createServer } from 'node:http'
import { createHealthStatus } from '../../../packages/domain/src/index.js'

const port = Number(process.env.WORKER_PORT ?? 3001)
const server = createServer((_request, response) => {
  response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
  response.end(JSON.stringify(createHealthStatus('worker')))
})

server.listen(port, () => console.log(`worker listening on ${port}`))
