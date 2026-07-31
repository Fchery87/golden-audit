import test from 'node:test'
import assert from 'node:assert/strict'
import { redactReportText, containsUnredactedIdentifier } from '../packages/redaction/src/index.js'
import { CreditAnalysisPlatform } from '../packages/platform/src/index.js'

const consent = { version: '2026-01', adultUSConsumer: true, authorizedReportUse: true, educationalLimitations: true, sensitiveDataHandling: true, residence: 'US-CA', analysisJurisdiction: 'US-CA' } as const

test('redaction: strips SSNs (dashed and bare 9-digit) and credential markers, with a count', () => {
  const raw = 'SSN 123-45-6789 alt 987654321 password: hunter2 cvv=123 keep 1234'
  const { redacted, redactions } = redactReportText(raw)
  assert.match(redacted, /SSN \[REDACTED\] alt \[REDACTED\] \[REDACTED\] \[REDACTED\] keep 1234/)
  assert.doesNotMatch(redacted, /123-45-6789|987654321|hunter2|cvv=123/)
  assert.equal(redactions, 4) // SSN (dashed) + bare 9-digit + password + cvv
  // short (4-digit) tokens that are not identifiers are preserved (no false positives)
  assert.match(redacted, /keep 1234/)
})

test('redaction: containsUnredactedIdentifier detects residual identifiers (stateless across calls)', () => {
  assert.equal(containsUnredactedIdentifier('contact 111-22-3333'), true)
  assert.equal(containsUnredactedIdentifier('clean text only'), false)
  // call twice to ensure no global-regex lastIndex drift
  assert.equal(containsUnredactedIdentifier('clean text only'), false)
  assert.equal(containsUnredactedIdentifier('pin: 0000'), true)
})

test('trust boundary: an SSN injected into the upload cannot reach the parsed report, findings, or audit', async () => {
  const platform = new CreditAnalysisPlatform()
  platform.configureLaunchScope({
    mode: 'one-state-free-pilot',
    approvedStates: ['US-CA'],
    provisionalSelectedState: 'US-CA',
    stateSelectionEvidenceReference: 'docs/one-state-launch-selection-memo.md',
    availabilityClaim: 'Pilot currently limited to approved states only.',
    pricingMode: 'free-pilot-only',
    nationwideStatus: 'not-cleared',
    notes: 'Analysis-only, educational, consumer-uploaded, consumer-only boundary.',
  })
  const inviteCode = await platform.issueInvite()
  const { sessionId } = await platform.register({ email: 'redact@example.com', password: 'correct horse battery staple', inviteCode })
  const workspace = await platform.recordConsent(sessionId, consent)
  await platform.acceptAuthorization(sessionId)
  const init = await platform.initializeUpload(sessionId, workspace.id)
  // identity intentionally contains a raw SSN; a tradeline balance differs so a finding is produced
  const payload = {
    provider: 'synthetic-provider', template: 'pilot-v1', reportDate: '2026-07-01',
    identity: ['A Consumer SSN 123-45-6789'], addresses: [], employers: [], inquiries: [], publicRecords: [], scores: [700], remarks: [],
    tradelines: [
      { bureau: 'equifax', creditor: 'Example Bank', account: '12345678', accountType: 'revolving', balance: 12500, status: 'open', opened: '2020-01', updated: '2026-06-30' },
      { bureau: 'experian', creditor: 'Example Bank', account: '12345678', accountType: 'revolving', balance: 15000, status: 'open', opened: '2020-01', updated: '2026-06-28' },
    ],
  }
  const bytes = Buffer.from(`<html>GOLDEN-AUDIT-REPORT:${JSON.stringify(payload)}</body></html>`)
  const upload = await platform.completeUpload({ uploadId: init.id, token: init.token, fileName: 'with-ssn.html', mediaType: 'text/html', bytes })
  assert.ok((upload.redactionCount ?? 0) > 0, 'redaction must run at the ingestion boundary')

  const report = await platform.parseReport(sessionId, upload.id)
  await platform.completeReview(sessionId, report.id)
  const match = (await platform.proposeMatches(sessionId, report.id))[0]!
  await platform.decideMatch(sessionId, match.id, 'confirmed', 'same account')

  // publish a ruleset so analysis can run (reuses governance path)
  platform.registerReviewer({ id: 'c', role: 'compliance-reviewer' })
  platform.registerReviewer({ id: 'e', role: 'engineering-reviewer' })
  platform.registerReviewer({ id: 'r', role: 'release-manager' })
  const authority = platform.createAuthority('c', { citation: '15 USC 1681', jurisdiction: 'US-CA', effectiveFrom: '2020-01-01', permittedUse: 'education', limitations: ['timing can explain differences'] })
  const module = platform.createEducationModule('c', { title: 'Balance timing', body: 'Bureaus update on different dates.', jurisdiction: 'US-CA', effectiveFrom: '2020-01-01', permittedUse: 'education', limitations: ['verify directly'] })
  platform.reviewGovernance('authority', authority.id, 'c', 'approved', 'ok')
  platform.reviewGovernance('module', module.id, 'c', 'approved', 'ok')
  const rule = platform.createRule('e', { name: 'cross-bureau-balance-difference', jurisdiction: 'US-CA', effectiveFrom: '2020-01-01', requiredInputs: ['balance'], minimumConfidence: 0.9, classification: 'verification-recommended', limitations: ['different update dates can explain a difference'], authorityIds: [authority.id], educationModuleIds: [module.id], testCases: ['balance-diff'] })
  platform.reviewGovernance('rule', rule.id, 'e', 'approved', 'ok')
  const ruleset = platform.publishRuleset('r', 'US-CA', '2026-07-01')

  const analysis = await platform.runAnalysis(sessionId, report.id, ruleset, 'US-CA')
  const events = await platform.getAuditEvents(sessionId)

  // The raw SSN must not appear anywhere downstream of the trust boundary
  const rawSsn = '123-45-6789'
  assert.ok(!JSON.stringify(report).includes(rawSsn), 'parsed report must not contain the raw SSN')
  assert.ok(!JSON.stringify(analysis).includes(rawSsn), 'analysis/findings must not contain the raw SSN')
  assert.ok(!JSON.stringify(events).includes(rawSsn), 'audit events must not contain the raw SSN')
  // And the boundary guard agrees the parsed report is clean of identifier patterns
  assert.equal(containsUnredactedIdentifier(JSON.stringify(report)), false)
})
