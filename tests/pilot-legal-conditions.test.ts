import test from 'node:test'
import assert from 'node:assert/strict'
import { CreditAnalysisPlatform, AUTHORIZATION_TEXT, AUTHORIZATION_VERSION, RETENTION_POLICY } from '../packages/platform/src/index.js'
import { assertSafeConsumerOutput, FORBIDDEN_DISPUTE_TERMS, FORBIDDEN_UPL_TERMS } from '../packages/output-guard/src/index.js'

// Ticket 12 — pilot legal conditions (derived from preliminary FCRA counsel opinion).
// Each test maps to a specific counsel condition (Q-L1 … Q-L5). These are the enforceable-in-code
// conditions; final legal clearance, GLBA classification, and CCSA registration remain human-gated.

const password = 'correct horse battery staple'
const consent = { version: '2026-01', adultUSConsumer: true, authorizedReportUse: true, educationalLimitations: true, sensitiveDataHandling: true, residence: 'US-CA', analysisJurisdiction: 'US-CA' } as const

const reportInput = {
  provider: 'synthetic-provider', template: 'pilot-v1', reportDate: '2026-07-01', identity: ['A Consumer'], addresses: [], employers: [], inquiries: [], publicRecords: [], scores: [700], remarks: [],
  tradelines: [{ bureau: 'equifax' as const, creditor: 'Example Bank', account: '12345678', accountType: 'revolving', balance: 12500, status: 'open', opened: '2020-01', updated: '2026-06-30' }],
}
const markerBytes = () => Buffer.from(`<html>GOLDEN-AUDIT-REPORT:${JSON.stringify(reportInput)}</body></html>`)

function onboard(platform: CreditAnalysisPlatform, email: string) {
  const { sessionId } = platform.register({ email, password })
  const workspace = platform.recordConsent(sessionId, consent)
  platform.acceptAuthorization(sessionId)
  return { sessionId, workspaceId: workspace.id }
}

// Q-L3 — Authorization: written authorization expressly accepted before any processing.
test('Q-L3: processing is gated on written authorization (completeUpload throws until accepted)', () => {
  const platform = new CreditAnalysisPlatform()
  const { sessionId } = platform.register({ email: 'auth@example.com', password })
  const workspace = platform.recordConsent(sessionId, consent)
  const init = platform.initializeUpload(sessionId, workspace.id)
  assert.throws(() => platform.completeUpload({ uploadId: init.id, token: init.token, fileName: 'r.html', mediaType: 'text/html', bytes: markerBytes() }), /Written authorization required/)
  const auth = platform.acceptAuthorization(sessionId)
  assert.equal(auth.version, AUTHORIZATION_VERSION); assert.ok(auth.acceptedAt)
  const completed = platform.completeUpload({ uploadId: init.id, token: init.token, fileName: 'r.html', mediaType: 'text/html', bytes: markerBytes() })
  assert.equal(completed.stage, 'ready-to-parse')
  const retained = platform.getAuthorization(sessionId)
  assert.equal(retained.version, AUTHORIZATION_VERSION); assert.equal(retained.acceptedAt, auth.acceptedAt)
  assert.ok(platform.getAuditEvents(sessionId).some(e => e.type === 'authorization-accepted'))
})

test('Q-L3/L1/pricing: written authorization discloses subject-only delivery, retention, and the free / no-sale / no-ad / no-training terms', () => {
  const text = AUTHORIZATION_TEXT.toLowerCase()
  for (const phrase of ['only to me', 'lenders, landlords, employers', 'retention', 'delete', 'free pilot', 'no payment', 'no data sale', 'no advertising', 'training']) {
    assert.ok(text.includes(phrase), `authorization text must disclose: "${phrase}"`)
  }
})

// Q-L1 — Delivery model: results to the authenticated subject only; no third-party / eligibility / ranking path.
test('Q-L1: no third-party delivery, eligibility, or comparative-ranking API path exists', () => {
  const names = Object.getOwnPropertyNames(CreditAnalysisPlatform.prototype)
  const forbidden = /share|lender|broker|eligib|underwrit|thirdpart|third-part|forwardto|agentdeliver|rankconsumer|approvalodds|scoreprobab/
  const hits = names.filter(n => forbidden.test(n.toLowerCase()))
  assert.deepEqual(hits, [], `forbidden delivery/ranking methods present: ${hits.join(', ')}`)
  for (const expected of ['acceptAuthorization', 'createExport', 'createConsumerReport', 'parseReport', 'requestDeletion']) assert.ok(names.includes(expected), `expected subject-facing method missing: ${expected}`)
})

test('Q-L1: a second authenticated consumer cannot read another subject report (subject-only delivery)', () => {
  const platform = new CreditAnalysisPlatform()
  const a = onboard(platform, 'subject@example.com')
  const b = onboard(platform, 'other@example.com')
  const init = platform.initializeUpload(a.sessionId, a.workspaceId)
  const completed = platform.completeUpload({ uploadId: init.id, token: init.token, fileName: 'r.html', mediaType: 'text/html', bytes: markerBytes() })
  const report = platform.parseReport(a.sessionId, completed.id)
  assert.throws(() => platform.parseReport(b.sessionId, completed.id), /Not found/)
  const firstTradeline = report.tradelines[0]; assert.ok(firstTradeline)
  assert.throws(() => platform.getSourceSnippet(b.sessionId, report.id, firstTradeline.creditor.id), /Not found/)
})

// Pricing — genuinely free pilot: no payment/billing/subscription path.
test('pricing: no payment, billing, or subscription API path exists (genuinely free pilot)', () => {
  const names = Object.getOwnPropertyNames(CreditAnalysisPlatform.prototype)
  const forbidden = /\bpay\b|charg|\bbill\b|subscri|stripe|price|\bfee\b|cart|checkout|invoice|payment/
  const hits = names.filter(n => forbidden.test(n.toLowerCase()))
  assert.deepEqual(hits, [], `forbidden payment methods present: ${hits.join(', ')}`)
})

// Q-L4 — Minimization, retention, deletion: bounded retention + visible deletion control.
test('Q-L4: retention policy is bounded, disclosed, and paired with a consumer deletion control', () => {
  assert.ok(RETENTION_POLICY.originalsMaxDays > 0 && RETENTION_POLICY.originalsMaxDays <= 90, 'originals retention must be short and bounded')
  assert.match(RETENTION_POLICY.deletionControl, /deletion/i)
  assert.match(RETENTION_POLICY.description, /operationally necessary|at most/i)
  const platform = new CreditAnalysisPlatform()
  assert.equal(platform.getRetentionPolicy().originalsMaxDays, RETENTION_POLICY.originalsMaxDays)
  assert.ok(Object.getOwnPropertyNames(CreditAnalysisPlatform.prototype).includes('requestDeletion'), 'visible consumer deletion control must exist')
})

// Q-L2 + Q-L5 — Marketing/UPL guardrails enforced at the outbound trust boundary.
test('Q-L2/Q-L5: output guard blocks dispute-generation and legal-conclusion language', () => {
  assert.ok(FORBIDDEN_DISPUTE_TERMS.length >= 5 && FORBIDDEN_UPL_TERMS.length >= 10)
  for (const term of FORBIDDEN_DISPUTE_TERMS) assert.throws(() => assertSafeConsumerOutput(`we can ${term} on your behalf`), /Output blocked/)
  for (const term of FORBIDDEN_UPL_TERMS) assert.throws(() => assertSafeConsumerOutput(`The bureau ${term}.`), /Output blocked/)
})
