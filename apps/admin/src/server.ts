import { createServer } from 'node:http'
import { createHealthStatus } from '../../../packages/domain/src/index.js'

const port = Number(process.env.ADMIN_PORT ?? 3002)
const server = createServer((_request, response) => {
  response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
  response.end(JSON.stringify(createHealthStatus('admin')))
})

server.listen(port, () => console.log(`admin listening on ${port}`))
