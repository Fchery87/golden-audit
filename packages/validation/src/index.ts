import type { ServiceName } from '../../domain/src/index.js'

export function parseServiceName(value: unknown): ServiceName {
  if (value === 'web' || value === 'worker' || value === 'admin') return value
  throw new Error(`Unknown service name: ${String(value)}`)
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
