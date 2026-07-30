import type { PagesFunction } from '@cloudflare/workers-types'
import { Response } from '@cloudflare/workers-types'
import { createHealthStatus } from '../../../../packages/domain/src/index.js'

export const onRequestGet: PagesFunction = () => {
  return new Response(JSON.stringify(createHealthStatus('web')), {
    status: 200,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  })
}
