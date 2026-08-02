import test from 'node:test'
import assert from 'node:assert/strict'
import { resolvePilotRuntimeConfiguration } from '../apps/web/functions/api/_platform.js'
import { onRequest } from '../apps/web/functions/api/consumer/[[path]].js'

const approvalAreas = ['product', 'legal', 'privacy', 'security', 'operations', 'accessibility', 'vendor'] as const
const validRecord = {
  scope: 'controlled-pilot',
  status: 'approved-for-configured-scope',
  launchScope: {
    mode: 'one-state-free-pilot',
    approvedStates: ['US-CA'],
    provisionalSelectedState: 'US-CA',
    stateSelectionEvidenceReference: 'controlled-evidence-reference',
    availabilityClaim: 'Pilot currently limited to approved states.',
    pricingMode: 'free-pilot-only',
    nationwideStatus: 'state-by-state-review',
    notes: 'Controlled real-consumer configuration.',
  },
  approvals: approvalAreas.map(area => ({ area, approver: `${area} owner`, evidenceReference: `${area}-evidence` })),
}

test('Pages runtime configuration keeps fixture mode diagnostic-only', () => {
  const result = resolvePilotRuntimeConfiguration({ PILOT_RUNTIME_MODE: 'fixture' })
  assert.equal(result.kind, 'fixture')
  if (result.kind !== 'fixture') return
  assert.equal(result.approvalRecord.scope, 'test-fixture-only')
  assert.deepEqual(result.approvalRecord.approvals, [])
})

test('Pages runtime configuration fails closed without a complete real-consumer approval record', () => {
  assert.deepEqual(resolvePilotRuntimeConfiguration({ PILOT_RUNTIME_MODE: 'real-consumer' }), { kind: 'invalid', reason: 'Pilot approval record is not configured' })
  assert.deepEqual(resolvePilotRuntimeConfiguration({ PILOT_RUNTIME_MODE: 'real-consumer', PILOT_APPROVAL_RECORD_JSON: JSON.stringify({ ...validRecord, scope: 'test-fixture-only' }) }), { kind: 'invalid', reason: 'Fixture approval data cannot enable consumer processing' })
  assert.deepEqual(resolvePilotRuntimeConfiguration({ PILOT_RUNTIME_MODE: 'real-consumer', PILOT_APPROVAL_RECORD_JSON: JSON.stringify({ ...validRecord, approvals: validRecord.approvals.slice(0, -1) }) }), { kind: 'invalid', reason: 'Pilot approval record is incomplete' })
})

test('Pages catch-all exposes diagnostics but blocks consumer processing in fixture mode', async () => {
  const env = { PILOT_RUNTIME_MODE: 'fixture' as const }
  const blocked = await onRequest({ request: new Request('https://pilot.example/api/consumer/register', { method: 'POST', body: '{}' }), env } as never)
  assert.equal(blocked.status, 503)
  assert.deepEqual(await blocked.json(), { error: 'Pilot is unavailable for consumer processing' })
  const availability = await onRequest({ request: new Request('https://pilot.example/api/pilot-availability?state=CA'), env } as never)
  assert.equal(availability.status, 200)
  const body = await availability.json() as { fixtureOnly: boolean; eligible: boolean }
  assert.equal(body.fixtureOnly, true)
  assert.equal(body.eligible, true)
})

test('Pages runtime configuration accepts only a complete explicit real-consumer contract', () => {
  const result = resolvePilotRuntimeConfiguration({ PILOT_RUNTIME_MODE: 'real-consumer', PILOT_APPROVAL_RECORD_JSON: JSON.stringify(validRecord) })
  assert.equal(result.kind, 'real-consumer')
  if (result.kind !== 'real-consumer') return
  assert.equal(result.approvalRecord.launchScope?.approvedStates[0], 'US-CA')
  assert.equal(result.approvalRecord.approvals.length, approvalAreas.length)
})
