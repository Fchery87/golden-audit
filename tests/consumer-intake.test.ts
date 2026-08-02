import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { CreditAnalysisPlatform, IDENTITY_ATTESTATION_VERSION, type Bureau } from '../packages/platform/src/index.js'
import { reviewedCaliforniaCatalog } from '../packages/platform/src/reviewed-content.js'
import { TEST_IDENTITY, attestTestIdentity } from './support-identity.js'

/**
 * Intake, delivery, and the audit summary.
 *
 * The behaviour under test is the shape of the consumer's path: identity in, report out, with no
 * confirmation wall between the two. The old flow required a consumer decision on every extracted
 * value before analysis could run — thousands of them on a real tri-bureau report — which is the
 * failure these tests exist to prevent recurring.
 */

const password = 'correct horse battery staple'
const consent = { version: '2026-01', adultUSConsumer: true, authorizedReportUse: true, educationalLimitations: true, sensitiveDataHandling: true, residence: 'US-CA', analysisJurisdiction: 'US-CA' } as const

function syntheticReport(overrides: Partial<{ tradelines: unknown[]; scores: number[] }> = {}) {
  return {
    provider: 'synthetic-provider', template: 'pilot-v1', reportDate: '2026-07-01',
    identity: ['A Consumer'], addresses: ['1 Main St'], employers: [], inquiries: ['Example Bank 2026-06'],
    publicRecords: [], scores: overrides.scores ?? [700], remarks: [],
    tradelines: overrides.tradelines ?? [
      { bureau: 'equifax' as Bureau, creditor: 'Example Bank', account: '12345678', accountType: 'revolving', balance: 12500, creditLimit: 50000, status: 'open', opened: '2020-01', updated: '2026-06-30' },
      { bureau: 'experian' as Bureau, creditor: 'Example Bank', account: '12345678', accountType: 'revolving', balance: 15000, creditLimit: 50000, status: 'open', opened: '2020-01', updated: '2026-06-28' },
      { bureau: 'equifax' as Bureau, creditor: 'Recovery Partners', account: '99887766', accountType: 'collection', balance: 40000, pastDue: 40000, status: 'collection', opened: '2023-05', updated: '2026-06-30' },
    ],
  }
}

async function setup(email = 'intake@example.com') {
  const platform = new CreditAnalysisPlatform(undefined, undefined, reviewedCaliforniaCatalog)
  platform.configureLaunchScope({
    mode: 'one-state-free-pilot', approvedStates: ['US-CA'], provisionalSelectedState: 'US-CA',
    stateSelectionEvidenceReference: 'docs/one-state-launch-selection-memo.md',
    availabilityClaim: 'Pilot currently limited to approved states only.',
    pricingMode: 'free-pilot-only', nationwideStatus: 'not-cleared',
    notes: 'Analysis-only, educational, consumer-uploaded, consumer-only boundary.',
  })
  const inviteCode = await platform.issueInvite()
  const { sessionId } = await platform.register({ email, password, inviteCode })
  const workspace = await platform.recordConsent(sessionId, consent)
  await platform.acceptAuthorization(sessionId)
  return { platform, sessionId, workspaceId: workspace.id }
}

const rulesetFor = (platform: CreditAnalysisPlatform) => platform.getPublishedRulesetVersionFor('US-CA')!

/** The full consumer path in one helper: upload, parse, match, analyse, deliver. */
async function deliverReading(platform: CreditAnalysisPlatform, sessionId: string, workspaceId: string, report = syntheticReport()) {
  const initialized = await platform.initializeUpload(sessionId, workspaceId)
  const upload = await platform.completeUpload({
    uploadId: initialized.id, token: initialized.token, fileName: 'report.html', mediaType: 'text/html',
    bytes: Buffer.from(`<html>GOLDEN-AUDIT-REPORT:${JSON.stringify(report)}</body></html>`),
  })
  const parsed = await platform.parseReport(sessionId, upload.id)
  await platform.proposeMatches(sessionId, parsed.id)
  const analysis = await platform.runAnalysis(sessionId, parsed.id, rulesetFor(platform), 'US-CA')
  return { parsed, analysis, consumerReport: await platform.createConsumerReport(sessionId, analysis.id) }
}

test('identity intake validates every field and records the attestation version', async () => {
  const { platform, sessionId } = await setup('validation@example.com')
  const reject = async (patch: Record<string, unknown>, expected: RegExp) =>
    assert.rejects(() => platform.recordConsumerIdentity(sessionId, { ...TEST_IDENTITY, ...patch }), expected)

  await reject({ accurateAndComplete: false }, /accuracy declaration/i)
  await reject({ fullName: 'Morgan' }, /including a last name/i)
  await reject({ fullName: 'Morgan Rivera 3rd' }, /may contain only letters/i)
  await reject({ dateOfBirth: '2020-01-01' }, /adults only/i)
  await reject({ dateOfBirth: '1985-02-30' }, /not a real calendar date/i)
  await reject({ dateOfBirth: '03/17/1985' }, /YYYY-MM-DD/i)
  // Refused rather than truncated: truncating would mean accepting more of the number than we
  // ever intend to hold before discarding the excess.
  await reject({ ssnLastFour: '123456789' }, /only the last four digits/i)
  await reject({ ssnLastFour: '12a4' }, /exactly four digits/i)
  await reject({ ssnLastFour: '0000' }, /cannot be 0000/i)
  await reject({ currentAddress: { ...TEST_IDENTITY.currentAddress, state: 'California' } }, /two-letter US state code/i)
  await reject({ currentAddress: { ...TEST_IDENTITY.currentAddress, postalCode: '9021' } }, /ZIP code must be five digits/i)
  await reject({ previousAddresses: Array.from({ length: 11 }, () => TEST_IDENTITY.currentAddress) }, /at most ten/i)

  const saved = await attestTestIdentity(platform, sessionId)
  assert.equal(saved.attestationVersion, IDENTITY_ATTESTATION_VERSION)
  assert.equal(saved.ssnLastFour, '4321')
  assert.equal(saved.fullName, 'MORGAN QUINCY RIVERA')
  assert.ok(Date.parse(saved.attestedAt) > 0)

  // Identity legitimately changes. Re-submitting replaces the record and re-stamps the attestation
  // rather than leaving a stale reference set producing variance findings that are our artefacts.
  const updated = await attestTestIdentity(platform, sessionId, { fullName: 'MORGAN QUINCY OKONKWO' })
  assert.equal(updated.fullName, 'MORGAN QUINCY OKONKWO')
  assert.equal((await platform.getConsumerIdentity(sessionId))?.fullName, 'MORGAN QUINCY OKONKWO')
})

test('uploading requires an attested identity, because the identity checks have no reference set without one', async () => {
  const { platform, sessionId, workspaceId } = await setup('gate@example.com')
  await assert.rejects(() => platform.initializeUpload(sessionId, workspaceId), /Identity details and the accuracy declaration are required/)
  await attestTestIdentity(platform, sessionId)
  await assert.doesNotReject(() => platform.initializeUpload(sessionId, workspaceId))
})

test('attested identity never leaks into audit metadata', async () => {
  const { platform, sessionId } = await setup('audit@example.com')
  await attestTestIdentity(platform, sessionId)
  const events = await platform.getAuditEvents(sessionId)
  const attestation = events.find((event: { type: string }) => event.type === 'consumer-identity-attested')
  assert.ok(attestation, 'the attestation itself is recorded')
  const metadata = JSON.stringify(attestation.metadata)
  for (const secret of [TEST_IDENTITY.fullName, TEST_IDENTITY.dateOfBirth, TEST_IDENTITY.ssnLastFour, TEST_IDENTITY.currentAddress.line1]) {
    assert.doesNotMatch(metadata, new RegExp(secret, 'i'), `audit metadata must not carry ${secret}`)
  }
})

test('one upload delivers a reading — no per-value confirmation stands between them', async () => {
  const { platform, sessionId, workspaceId } = await setup('delivery@example.com')
  await attestTestIdentity(platform, sessionId)
  const { parsed, consumerReport } = await deliverReading(platform, sessionId, workspaceId)

  assert.equal(parsed.reviewComplete, false, 'the reading is delivered without a completed review pass')
  assert.ok(consumerReport.findings.length >= 1, 'the delivered reading carries findings')

  // The correction surface exists but lists only extraction exceptions. A confidently-read value
  // is never a question: on a real tri-bureau report there are thousands of them.
  const review = await platform.getValueReview(sessionId, parsed.id)
  assert.equal(review.values.length, 0, 'a fully confident fixture produces no exceptions to ask about')
  assert.ok(review.values.every(value => value.confidence < 0.9 || value.state === 'parser-failed'))
})

test('a correction to any value is accepted and re-running analysis picks it up', async () => {
  const { platform, sessionId, workspaceId } = await setup('correction@example.com')
  await attestTestIdentity(platform, sessionId)
  const { parsed } = await deliverReading(platform, sessionId, workspaceId)
  const line = parsed.tradelines.find(item => item.creditor.bureau === 'equifax' && item.creditor.normalized === 'Example Bank')!

  // We only *prompt* about exceptions, but a consumer reading their own report is the ground
  // truth for any value, so a correction to a confidently-read one is still accepted.
  const corrected = await platform.reviewValue(sessionId, parsed.id, line.balance.id, { decision: 'corrected', reason: 'Statement page 4', replacement: 15000 })
  assert.equal(corrected.tradelines.find(item => item.id === line.id)?.balance.review?.replacement, 15000)
  assert.equal(corrected.tradelines.find(item => item.id === line.id)?.balance.originalDisplay, '$125.00', 'the original display is preserved')

  const listed = await platform.getValueReview(sessionId, parsed.id)
  assert.equal(listed.values.filter(value => value.id === line.balance.id).length, 1, 'a corrected value stays listed so it can be revised')

  await assert.rejects(() => platform.reviewValue(sessionId, parsed.id, line.balance.id, { decision: 'corrected', reason: 'no value' }), /supply a replacement/i)
  await assert.rejects(() => platform.reviewValue(sessionId, parsed.id, line.balance.id, { decision: 'corrected', reason: 'wrong type', replacement: 'not a number' }), /match the extracted value type/i)

  // completeReview never rejects outstanding exceptions: an unanswered one simply stays suppressed.
  await assert.doesNotReject(() => platform.completeReview(sessionId, parsed.id))
})

test('an unambiguous cross-bureau group confirms itself; an ambiguous one suppresses its checks without withholding the reading', async () => {
  const { platform, sessionId, workspaceId } = await setup('matching@example.com')
  await attestTestIdentity(platform, sessionId)

  const collisionReport = syntheticReport({
    tradelines: [
      { bureau: 'equifax' as Bureau, creditor: 'Store Card', account: '10001234', accountType: 'revolving', balance: 10000, status: 'open', opened: '2020-01', updated: '2026-06-30' },
      { bureau: 'experian' as Bureau, creditor: 'Store Card', account: '20001234', accountType: 'revolving', balance: 10500, status: 'open', opened: '2020-01', updated: '2026-06-28' },
      { bureau: 'transunion' as Bureau, creditor: 'Store Card', account: '30001234', accountType: 'revolving', balance: 10250, status: 'open', opened: '2020-01', updated: '2026-06-27' },
      { bureau: 'equifax' as Bureau, creditor: 'Store Card', account: '40001234', accountType: 'revolving', balance: 10100, status: 'open', opened: '2020-01', updated: '2026-06-26' },
    ],
  })
  const { parsed, consumerReport } = await deliverReading(platform, sessionId, workspaceId, collisionReport)

  const pending = await platform.listPendingMatches(sessionId, parsed.id)
  assert.equal(pending.matches.length, 1, 'the four-entry collision set stays unresolved')
  assert.equal(pending.matches[0]?.state, 'split')
  assert.equal(pending.tradelines.length, 4, 'the pending set carries the detail needed to decide it')
  assert.equal(consumerReport.content?.pendingMatchGroups, 1, 'the reading says so rather than withholding itself')

  const suppressed = consumerReport.content?.coverage.filter(row => row.outcomes.some(outcome => outcome.outcome === 'suppressed' && /await your confirmation/i.test(outcome.reason))) ?? []
  assert.ok(suppressed.length > 0, 'the checks that did not run are named in the coverage table')
})

test('the audit summary counts accounts, not bureau entries, and marks what it could not read', async () => {
  const { platform, sessionId, workspaceId } = await setup('summary@example.com')
  await attestTestIdentity(platform, sessionId)
  const { consumerReport } = await deliverReading(platform, sessionId, workspaceId)
  const summary = consumerReport.content?.summary
  assert.ok(summary)

  // Three bureau entries: two for one card (one account) plus one collection.
  assert.equal(summary.accountsRead, 2, 'a card furnished to two bureaus is one account, not two')
  assert.equal(summary.openAccounts, 1)
  assert.equal(summary.negativeItems.collections, 1)
  assert.equal(summary.negativeItems.pastDueAccounts, 1)
  assert.equal(summary.negativeItems.total, 1, 'one account carrying several negative markers is still one account')
  assert.equal(summary.inquiriesRead, 1)

  // Where bureaus disagree the highest reported figure is used, and the report says so.
  assert.equal(summary.totalBalanceCents, 15000 + 40000)
  assert.equal(summary.totalPastDueCents, 40000)
  assert.equal(summary.utilization.accountsCounted, 1)
  assert.equal(summary.utilization.revolvingLimitCents, 50000)
  assert.ok((summary.crossBureauInconsistencies ?? 0) >= 1)
})

test('a second upload is diffed against the previous reading, and only fields readable in both are compared', async () => {
  const { platform, sessionId, workspaceId } = await setup('reimport@example.com')
  await attestTestIdentity(platform, sessionId)

  const first = await deliverReading(platform, sessionId, workspaceId)
  assert.equal(first.consumerReport.content?.reimport, undefined, 'a first reading has nothing to compare against')

  const changed = syntheticReport({
    scores: [720],
    tradelines: [
      { bureau: 'equifax' as Bureau, creditor: 'Example Bank', account: '12345678', accountType: 'revolving', balance: 9900, creditLimit: 50000, status: 'open', opened: '2020-01', updated: '2026-08-01' },
      { bureau: 'experian' as Bureau, creditor: 'Example Bank', account: '12345678', accountType: 'revolving', balance: 9900, creditLimit: 50000, status: 'open', opened: '2020-01', updated: '2026-08-01' },
      { bureau: 'equifax' as Bureau, creditor: 'New Lender', account: '55554444', accountType: 'installment', balance: 250000, status: 'open', opened: '2026-07', updated: '2026-08-01' },
    ],
  })
  const second = await deliverReading(platform, sessionId, workspaceId, changed)
  const reimport = second.consumerReport.content?.reimport
  assert.ok(reimport, 'the second reading is diffed against the first')
  assert.equal(reimport.previousConsumerReportId, first.consumerReport.id)

  assert.deepEqual(reimport.newAccounts.map(account => account.creditor), ['New Lender'])
  assert.deepEqual(reimport.removedAccounts.map(account => account.creditor), ['Recovery Partners'])
  const balanceChange = reimport.changedAccounts.find(account => account.creditor === 'Example Bank')?.changes.find(change => change.field === 'Balance')
  assert.deepEqual(balanceChange, { field: 'Balance', from: '$125.00', to: '$99.00' })
  assert.ok(reimport.findingsResolved.length > 0, 'balances that now agree drop the finding that reported their difference')
})

test('the delivered reading reports personal information against the attested identity', { skip: !existsSync('docs/reports/Credit Report - IdentityIQ.pdf') }, async () => {
  const { platform, sessionId, workspaceId } = await setup('pii@example.com')
  await attestTestIdentity(platform, sessionId)
  const initialized = await platform.initializeUpload(sessionId, workspaceId)
  const upload = await platform.completeUpload({
    uploadId: initialized.id, token: initialized.token, fileName: 'report.pdf', mediaType: 'application/pdf',
    bytes: readFileSync('docs/reports/Credit Report - IdentityIQ.pdf'),
  })
  const parsed = await platform.parseReport(sessionId, upload.id)
  await platform.proposeMatches(sessionId, parsed.id)
  const analysis = await platform.runAnalysis(sessionId, parsed.id, rulesetFor(platform), 'US-CA')
  const consumerReport = await platform.createConsumerReport(sessionId, analysis.id)

  const rows = consumerReport.content?.identityRows ?? []
  assert.ok(rows.length > 0, 'the personal-information section is read and reported')
  assert.ok(rows.some(row => row.field === 'name'), 'names are read from every bureau column')
  assert.ok(rows.some(row => row.field === 'dateOfBirth'))
  assert.ok(rows.some(row => row.field === 'currentAddress'))
  // The fixture identity is deliberately unlike this document's, so every compared row differs.
  assert.ok(rows.some(row => row.attestationMatch === 'differs-from-attested'))
  assert.ok(rows.every(row => Boolean(row.source.locator)), 'every reported detail keeps its source reference')

  const identityFindings = consumerReport.findings.filter(finding => finding.evidence.some(item => item.subject === 'identity'))
  assert.ok(identityFindings.length > 0, 'a report that does not match the attested identity produces identity findings')
  assert.equal(consumerReport.content?.summary?.identityObservations, identityFindings.length)
})
