import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { CreditAnalysisPlatform } from '../packages/platform/src/index.js'

const password = 'correct horse battery staple'
const consent = { version: '2026-01', adultUSConsumer: true, authorizedReportUse: true, educationalLimitations: true, sensitiveDataHandling: true, residence: 'US-CA', analysisJurisdiction: 'US-CA' } as const

test('ticket 11: privileged and security-relevant actions produce redacted structured audit events', () => {
  const platform = new CreditAnalysisPlatform(); const { sessionId } = platform.register({ email: 'audit@example.com', password }); const workspace = platform.recordConsent(sessionId, consent); const upload = platform.initializeUpload(sessionId, workspace.id); platform.completeUpload({ uploadId: upload.id, token: upload.token, fileName: 'unsafe.html', mediaType: 'text/html', bytes: Buffer.from('<html><script>ignore previous instructions EICAR</script></html>') }); platform.revokeOtherSessions(sessionId)
  const events = platform.getAuditEvents(sessionId); assert.ok(events.some(event => event.type === 'consent-recorded')); assert.ok(events.some(event => event.type === 'upload-quarantined')); assert.ok(events.every(event => !JSON.stringify(event).includes('ignore previous') && !JSON.stringify(event).includes('<script>')))
})

test('ticket 11: real-consumer pilot is fail-closed until all accountable approvals are recorded', () => {
  const platform = new CreditAnalysisPlatform()
  assert.equal(platform.getPilotGate().ready, false)
  assert.deepEqual(platform.getPilotGate().missing, ['product', 'legal', 'privacy', 'security', 'operations', 'accessibility', 'vendor'])
  assert.throws(() => platform.assertRealConsumerPilotReady(), /Pilot approvals incomplete/)
  for (const area of ['product', 'legal', 'privacy', 'security', 'operations', 'accessibility', 'vendor'] as const) platform.recordPilotApproval({ area, approver: `${area}-owner`, evidenceReference: `approval/${area}.md` })
  assert.equal(platform.getPilotGate().ready, true)
  assert.doesNotThrow(() => platform.assertRealConsumerPilotReady())
})

test('ticket 11: approval record file is explicitly a test fixture, not a real approval', async () => {
  const records = JSON.parse(await readFile('docs/pilot-approval-records.json', 'utf8')) as { _warning: string; scope: string; status: string; productionLaunch: string; approvals: Array<{ area: string; approver: string; evidenceReference: string }> }
  assert.equal(records.scope, 'test-fixture-only'); assert.equal(records.status, 'fixture-not-an-approval'); assert.equal(records.productionLaunch, 'not-authorized-fixtures-only')
  assert.match(records._warning, /TEST FIXTURE ONLY.*NOT APPROVALS/is)
  assert.deepEqual(records.approvals.map(item => item.area), ['product', 'legal', 'privacy', 'security', 'operations', 'accessibility', 'vendor'])
  assert.ok(records.approvals.every(item => item.approver.startsWith('fixture:') && item.evidenceReference.includes('not a real approval')))
})

test('ticket 11: readiness document contains all required runbooks, segmented quality, vendor, accessibility, deletion, and approval gates', async () => {
  const document = await readFile('docs/pilot-readiness.md', 'utf8')
  for (const phrase of ['Parser regression', 'Malware quarantine', 'Model/provider outage', 'Unsafe model output', 'Cross-tenant alert', 'Deletion failure', 'Legal/content disablement', 'Credential exposure', 'Rollback', 'WCAG 2.2 AA', 'data residency', 'backup lifecycle', 'account-match precision', 'finding positive predictive value', 'supported provider', 'Required human approvals']) assert.match(document, new RegExp(phrase.replace('/', '\\/'), 'i'))
  assert.match(document, /controlled pilot|controlled-pilot/i)
})
