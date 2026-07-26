import { createServer } from 'node:http'
import { createHealthStatus } from '../../../packages/domain/src/index.js'

const port = Number(process.env.WEB_PORT ?? 3000)
const server = createServer((_request, response) => {
  response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
  response.end(JSON.stringify(createHealthStatus('web')))
})

server.listen(port, () => console.log(`web listening on ${port}`))
