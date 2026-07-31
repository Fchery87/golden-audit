import type { PagesFunction } from '@cloudflare/workers-types'
import { createHealthStatus } from '../../../../packages/domain/src/index.js'

export const onRequestGet: PagesFunction = () => {
  return new globalThis.Response(JSON.stringify(createHealthStatus('web')), {
    status: 200,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  }) as any
}
