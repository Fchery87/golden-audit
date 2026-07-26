import test from 'node:test'
import assert from 'node:assert/strict'
import { applicationVersion, createHealthStatus } from '../packages/domain/src/index.js'
import { parseServiceName } from '../packages/validation/src/index.js'

test('shared domain health status has a stable foundation contract', () => {
  const checkedAt = new Date('2026-01-01T00:00:00.000Z')
  assert.deepEqual(createHealthStatus('web', checkedAt), {
    service: 'web',
    status: 'ok',
    version: applicationVersion,
    checkedAt: checkedAt.toISOString(),
  })
})

test('shared validation accepts only known service boundaries', () => {
  assert.equal(parseServiceName('worker'), 'worker')
  assert.throws(() => parseServiceName('unknown'), /Unknown service name/)
})
