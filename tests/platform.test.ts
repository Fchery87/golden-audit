import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { CreditAnalysisPlatform, type Bureau, type ReportPresentationProfile } from '../packages/platform/src/index.js'
import { attestTestIdentity } from './support-identity.js'

const password = 'correct horse battery staple'
const consent = { version: '2026-01', adultUSConsumer: true, authorizedReportUse: true, educationalLimitations: true, sensitiveDataHandling: true, residence: 'US-CA', analysisJurisdiction: 'US-CA' } as const
const reportInput = {
  provider: 'synthetic-provider', template: 'pilot-v1', reportDate: '2026-07-01', identity: ['A Consumer'], addresses: ['1 Main St'], employers: [], inquiries: ['Example Bank 2026-06'], publicRecords: [], scores: [700], remarks: [],
  tradelines: [
    { bureau: 'equifax' as Bureau, creditor: 'Example Bank', account: '12345678', accountType: 'revolving', balance: 12500, status: 'open', opened: '2020-01', updated: '2026-06-30' },
    { bureau: 'experian' as Bureau, creditor: 'Example Bank', account: '12345678', accountType: 'revolving', balance: 15000, status: 'open', opened: '2020-01', updated: '2026-06-28' },
  ],
}

async function completeAllReviewValues(platform: CreditAnalysisPlatform, sessionId: string, reportId: string): Promise<void> {
  const review = await platform.getValueReview(sessionId, reportId)
  for (const value of review.values) await platform.reviewValue(sessionId, reportId, value.id, { decision: 'confirmed', reason: 'Synthetic fixture value confirmed for test.' })
  await platform.completeReview(sessionId, reportId)
}

// D10: registration requires a single-use invite code. Every test that registers an account
// mints its own via issueInvite() — the operator-facing path (no HTTP route exposes this;
// invite-only means codes are issued out of band).
async function registerAccount(platform: CreditAnalysisPlatform, email: string): Promise<{ userId: string; sessionId: string }> {
  const inviteCode = await platform.issueInvite()
  return platform.register({ email, password, inviteCode })
}

test('owner presentation profile is validated, owner-scoped, csrf-protected, and snapshotted prospectively', async () => {
  const previousOwner = process.env.GOLDEN_AUDIT_OWNER_EMAIL
  process.env.GOLDEN_AUDIT_OWNER_EMAIL = 'owner@example.com'
  try {
    const platform = new CreditAnalysisPlatform(undefined, undefined, undefined, process.env.GOLDEN_AUDIT_OWNER_EMAIL)
    platform.configureLaunchScope({ mode: 'one-state-free-pilot', approvedStates: ['US-CA'], provisionalSelectedState: 'US-CA', stateSelectionEvidenceReference: 'memo', availabilityClaim: 'Pilot limited to approved states.', pricingMode: 'free-pilot-only', nationwideStatus: 'not-cleared', notes: 'Educational analysis only.' })
    const owner = await registerAccount(platform, 'owner@example.com')
    const consumer = await registerAccount(platform, 'consumer-two@example.com')
    const dashboard = await platform.getAdminDashboard(owner.sessionId)
    await assert.rejects(() => platform.updateReportPresentationProfile(consumer.sessionId, 'wrong', dashboard.profile.revision, { organizationName: 'Nope' }), /Owner authorization|required|request protection/)
    await assert.rejects(() => platform.updateReportPresentationProfile(owner.sessionId, 'wrong', dashboard.profile.revision, { organizationName: 'Updated Audit' }), /request protection/)
    const saved = await platform.updateReportPresentationProfile(owner.sessionId, dashboard.csrfToken, dashboard.profile.revision, { organizationName: 'Updated Audit', supportEmail: '' })
    assert.equal(saved.organizationName, 'Updated Audit')
    assert.equal(saved.supportEmail, undefined)
    await assert.rejects(() => platform.updateReportPresentationProfile(owner.sessionId, dashboard.csrfToken, saved.revision, { unknownField: 'not allowed' } as Partial<ReportPresentationProfile>), /unsupported field/)
  } finally {
    if (previousOwner === undefined) delete process.env.GOLDEN_AUDIT_OWNER_EMAIL
    else process.env.GOLDEN_AUDIT_OWNER_EMAIL = previousOwner
  }
})


// Uploads a real (gitignored) IdentityIQ PDF through the full platform flow and asserts it routed through
// the REAL adapter — not the synthetic fixture marker. Structure-only; never asserts or prints values.
const WIRING_PDFS = [
  'docs/reports/Credit Report - IdentityIQ.pdf',
  'docs/reports/Credit Report - IdentityIQ (copy).pdf',
  'docs/reports/Credit Report - IdentityIQ (another copy).pdf',
  'docs/reports/C_Pique_Credit Report - IdentityIQ.pdf',
]
test('wiring: completeUpload(pdf) → parseReport routes through the real IdentityIQ adapter', { skip: !hasBin('pdftotext') }, async () => {
  let checkedAny = false; const failed: string[] = []
  for (const p of WIRING_PDFS) {
    if (!existsSync(p)) continue
    checkedAny = true
    const { platform, sessionId, workspace } = await setup()
    const init = await platform.initializeUpload(sessionId, workspace.id)
    const completed = await platform.completeUpload({ uploadId: init.id, token: init.token, fileName: p.split('/').pop() ?? p, mediaType: 'application/pdf', bytes: readFileSync(p) })
    if (completed.stage !== 'ready-to-parse' || completed.mediaType !== 'application/pdf' || completed.scanResult !== 'clean') { failed.push(`${p}: upload stage/media/scan`); continue }
    if (completed.sanitizedContent !== undefined) failed.push(`${p}: PDF upload must NOT carry sanitizedContent (PII hygiene)`) // bytes live in a private map, never on the returned Upload
    const report = await platform.parseReport(sessionId, completed.id)
    const bureaus = new Set(report.tradelines.map(t => t.balance.bureau))
    const realAdapter = report.provider === 'identityiq' && report.template === 'identityiq-pdf-v1' // NOT 'synthetic-provider'/'pilot-v1'
    const threeBureaus = bureaus.has('transunion') && bureaus.has('experian') && bureaus.has('equifax')
    const usdBalances = report.tradelines.every(t => t.balance.currency === 'USD' && t.balance.state === 'known')
    const scoreIntegrity = report.scores.length === 3 && report.scores.every(score => score.state === 'known' && score.scale.state === 'known' && Boolean(score.source.locator) && Boolean(score.scale.source.locator) && score.normalized !== null && /^\d{3}-\d{3}$/.test(score.scale.normalized ?? ''))
    const inquiryIntegrity = report.inquiries.every(inquiry => inquiry.creditor.state === 'known' && inquiry.date.state === 'known' && inquiry.date.normalized !== null && Boolean(inquiry.creditor.source.locator) && Boolean(inquiry.date.source.locator))
    if (!realAdapter || report.tradelines.length === 0 || !threeBureaus || !usdBalances || !scoreIntegrity || !inquiryIntegrity) failed.push(`${p}: adapter=${realAdapter} tradelines=${report.tradelines.length} scores=${report.scores.length} inquiries=${report.inquiries.length} bureaus=[${[...bureaus].join(',')}]`)
    // assert NOTHING about balance amounts or account numbers — structure only.
  }
  if (!checkedAny) return // all real files absent (gitignored) → pass vacuously in CI
  assert.equal(failed.length, 0, `wiring proof failures: ${failed.join('; ') || '(none)'}`)
})

function hasBin(bin: string): boolean { try { execSync(`command -v ${bin}`, { stdio: 'ignore' }); return true } catch { return false } }

async function setup() {
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
  const account = await registerAccount(platform, 'consumer@example.com')
  const workspace = await platform.recordConsent(account.sessionId, consent)
  await attestTestIdentity(platform, account.sessionId)
  await platform.acceptAuthorization(account.sessionId) // FCRA counsel Q-L3: written authorization before processing
  return { platform, ...account, workspace }
}

async function uploadAndParse(platform: CreditAnalysisPlatform, sessionId: string, workspaceId: string) {
  const initialized = await platform.initializeUpload(sessionId, workspaceId)
  const bytes = Buffer.from(`<html>GOLDEN-AUDIT-REPORT:${JSON.stringify(reportInput)}</body></html>`)
  const upload = await platform.completeUpload({ uploadId: initialized.id, token: initialized.token, fileName: 'report.html', mediaType: 'text/html', bytes })
  return { upload, report: await platform.parseReport(sessionId, upload.id) }
}

function publishFixtureRules(platform: CreditAnalysisPlatform) {
  platform.registerReviewer({ id: 'reviewer-1', role: 'compliance-reviewer' })
  platform.registerReviewer({ id: 'reviewer-2', role: 'engineering-reviewer' })
  platform.registerReviewer({ id: 'release-1', role: 'release-manager' })
  const authority = platform.createAuthority('reviewer-1', { citation: '15 USC 1681', jurisdiction: 'US-CA', effectiveFrom: '2020-01-01', permittedUse: 'education', limitations: ['A consumer report alone may not establish a legal violation'] })
  const module = platform.createEducationModule('reviewer-1', { title: 'Balance timing', body: 'Bureaus can update on different dates.', jurisdiction: 'US-CA', effectiveFrom: '2020-01-01', permittedUse: 'education', limitations: ['Verify current information directly'] })
  platform.reviewGovernance('authority', authority.id, 'reviewer-1', 'approved', 'Counsel-approved pilot source')
  platform.reviewGovernance('module', module.id, 'reviewer-1', 'approved', 'Approved educational wording')
  const rule = platform.createRule('reviewer-2', { name: 'cross-bureau-balance-difference', jurisdiction: 'US-CA', effectiveFrom: '2020-01-01', requiredInputs: ['balance', 'updated'], minimumConfidence: 0.9, classification: 'verification-recommended', limitations: ['Different update dates can explain a difference'], authorityIds: [authority.id], educationModuleIds: [module.id], testCases: ['balance-difference'] })
  platform.reviewGovernance('rule', rule.id, 'reviewer-2', 'approved', 'Fixture passes')
  return platform.publishRuleset('release-1', 'US-CA', '2026-07-01')
}

test('ticket 02: account consent gate, session revocation, and tenant isolation fail closed', async () => {
  const { platform, sessionId, workspace } = await setup()
  assert.equal((await platform.getWorkspace(sessionId, workspace.id)).userId, workspace.userId)
  const other = await registerAccount(platform, 'other@example.com')
  await assert.rejects(() => platform.getWorkspace(other.sessionId, workspace.id), /Not found/)
  await assert.rejects(() => platform.initializeUpload(other.sessionId, workspace.id), /Not found/)
  await platform.revokeSession(sessionId)
  await assert.rejects(() => platform.getWorkspace(sessionId, workspace.id), /Authentication required/)
  const signedIn = await platform.signIn({ email: 'consumer@example.com', password })
  assert.equal((await platform.getWorkspace(signedIn, workspace.id)).id, workspace.id)
})

test('launch scope: consent requires an approved state and configured launch scope', async () => {
  const platform = new CreditAnalysisPlatform()
  const { sessionId } = await registerAccount(platform, 'scope@example.com')
  await assert.rejects(() => platform.recordConsent(sessionId, consent), /Launch scope is not configured/)
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
  await assert.doesNotReject(() => platform.recordConsent(sessionId, consent))
  const other = await registerAccount(platform, 'scope-other@example.com')
  await assert.rejects(() => platform.recordConsent(other.sessionId, { ...consent, residence: 'US-NY', analysisJurisdiction: 'US-NY' }), /Jurisdiction is not enabled for the pilot/)
})

test('ticket 03: private ingestion validates, quarantines, expires, and deduplicates safely', async () => {
  const { platform, sessionId, workspace } = await setup()
  const first = await platform.initializeUpload(sessionId, workspace.id)
  const bytes = Buffer.from(`<html>GOLDEN-AUDIT-REPORT:${JSON.stringify(reportInput)}</body></html>`)
  const completed = await platform.completeUpload({ uploadId: first.id, token: first.token, fileName: 'report.html', mediaType: 'text/html', bytes })
  assert.equal(completed.stage, 'ready-to-parse'); assert.equal(completed.scanResult, 'clean'); assert.match(completed.sourceHash ?? '', /^[a-f0-9]{64}$/); assert.equal(completed.retentionClass, 'consumer-report')
  const retry = await platform.completeUpload({ uploadId: first.id, token: first.token, fileName: 'report.html', mediaType: 'text/html', bytes }); assert.equal(retry.id, completed.id)
  const unsafe = await platform.initializeUpload(sessionId, workspace.id); const quarantined = await platform.completeUpload({ uploadId: unsafe.id, token: unsafe.token, fileName: 'bad.html', mediaType: 'text/html', bytes: Buffer.from('<html><script>EICAR</script></html>') }); assert.equal(quarantined.stage, 'quarantined'); assert.doesNotMatch(quarantined.failureMessage ?? '', /stack|Error:/)
  const mismatch = await platform.initializeUpload(sessionId, workspace.id); assert.equal((await platform.completeUpload({ uploadId: mismatch.id, token: mismatch.token, fileName: 'fake.pdf', mediaType: 'application/pdf', bytes: Buffer.from('<html></html>') })).stage, 'final-failure')
  const expired = await platform.initializeUpload(sessionId, workspace.id, -1); await assert.rejects(() => platform.completeUpload({ uploadId: expired.id, token: expired.token, fileName: 'x.pdf', mediaType: 'application/pdf', bytes: Buffer.from('%PDF-safe') }), /expired/)
})

test('ticket 04: parsing preserves bureau provenance, masks identifiers, and audits corrections', async () => {
  const { platform, sessionId, workspace } = await setup(); const { report } = await uploadAndParse(platform, sessionId, workspace.id)
  assert.equal(report.parserVersion, 'fixture-adapter@1'); assert.equal(report.tradelines.length, 2); assert.notEqual(report.tradelines[0]?.balance.bureau, report.tradelines[1]?.balance.bureau); assert.equal(report.tradelines[0]?.maskedAccount.normalized, '••••5678'); assert.equal(report.tradelines[0]?.opened.datePrecision, 'month'); assert.equal(report.tradelines[0]?.balance.currency, 'USD')
  const balance = report.tradelines[0]?.balance; assert.ok(balance); assert.equal((await platform.getSourceSnippet(sessionId, report.id, balance.id)).locator, '0:balance')
  const corrected = await platform.reviewValue(sessionId, report.id, balance.id, { decision: 'corrected', reason: 'Compared with statement', replacement: 12000 }); assert.equal(corrected.normalizedVersion, 2); assert.equal(corrected.tradelines[0]?.balance.review?.replacement, 12000); assert.equal(corrected.tradelines[0]?.balance.originalDisplay, '$125.00')
})

test('source-value review is owner-scoped and reviewed corrections drive matching, analysis, report snapshots, and exports', async () => {
  const { platform, sessionId, workspace } = await setup()
  const { report } = await uploadAndParse(platform, sessionId, workspace.id)
  const other = await registerAccount(platform, 'review-intruder@example.com')
  // getValueReview now lists only extraction exceptions, so a confidently-read fixture value is
  // deliberately absent from it. Corrections are still accepted against any value, which is what
  // this test exercises — the ids come from the report itself rather than the prompt list.
  const equifaxLine = report.tradelines.find(line => line.creditor.bureau === 'equifax')!
  const balance = equifaxLine.balance
  const creditor = equifaxLine.creditor
  await assert.rejects(() => platform.getValueReview(other.sessionId, report.id), /Not found/)
  await assert.rejects(() => platform.reviewValue(other.sessionId, report.id, balance.id, { decision: 'confirmed', reason: 'intruder' }), /Not found/)
  await platform.reviewValue(sessionId, report.id, balance.id, { decision: 'corrected', reason: 'Statement shows a corrected balance.', replacement: 15000 })
  await platform.reviewValue(sessionId, report.id, creditor.id, { decision: 'unknown', reason: 'Cannot confirm this creditor.' })
  await platform.completeReview(sessionId, report.id)
  const matches = await platform.proposeMatches(sessionId, report.id)
  assert.equal(matches.length, 0, 'unknown creditor removes the otherwise matchable account from grouping')
  const analysis = await platform.runAnalysis(sessionId, report.id, publishFixtureRules(platform), 'US-CA')
  assert.equal(analysis.findings.length, 0, 'unavailable match input suppresses dependent comparison')
  const consumerReport = await platform.createConsumerReport(sessionId, analysis.id)
  const correctedBalance = consumerReport.content?.accountRows?.find(row => row.bureau === 'equifax')?.cells.find(cell => cell.label === 'Balance')
  assert.equal(correctedBalance?.value, '$150.00')
  const exported = await platform.createExport(sessionId, consumerReport.id)
  assert.match(exported.content, /\$150\.00/)
  // A corrected value stays listed so it can be revised, and its original display is preserved.
  const stored = await platform.getValueReview(sessionId, report.id)
  assert.equal(stored.values.find(value => value.id === balance.id)?.originalDisplay, '$125.00')
  assert.equal(stored.values.find(value => value.id === balance.id)?.review?.replacement, 15000)
})

test('ticket 05: governance publishes only approved immutable effective content', () => {
  const platform = new CreditAnalysisPlatform(); const version = publishFixtureRules(platform); const effective = platform.getEffectiveRules('US-CA', '2026-07-01'); assert.equal(effective.length, 1); assert.equal(effective[0]?.version, version); assert.equal(effective[0]?.status, 'published'); assert.equal(platform.getEffectiveAuthorities('US-CA', '2026-07-01').length, 1); assert.equal(platform.getEffectiveEducationModules('US-CA', '2026-07-01').length, 1)
  assert.throws(() => platform.createRule('intruder', { name: 'unauthorized', jurisdiction: 'US-CA', effectiveFrom: '2020-01-01', requiredInputs: ['balance'], minimumConfidence: 1, classification: 'observed-fact', limitations: [], authorityIds: [], educationModuleIds: [], testCases: ['fixture'] }), /not authorized/)
  assert.throws(() => platform.createRule('reviewer-2', { name: 'incomplete', jurisdiction: 'US-CA', effectiveFrom: '2020-01-01', requiredInputs: [], minimumConfidence: 1, classification: 'observed-fact', limitations: [], authorityIds: [], educationModuleIds: [], testCases: [] }), /incomplete/)
})

test('tickets 06-08: confirmed matching drives deterministic findings and user-controlled report actions', async () => {
  const { platform, sessionId, workspace } = await setup(); const { report } = await uploadAndParse(platform, sessionId, workspace.id); const ruleset = publishFixtureRules(platform); await completeAllReviewValues(platform, sessionId, report.id)
  // Same creditor, same masked account, one entry per bureau, no collision: unambiguous, so the
  // group confirms itself and analysis needs no consumer decision. The two entries report DIFFERENT
  // balances — that difference is the finding below, not a reason to withhold the match.
  const matches = await platform.proposeMatches(sessionId, report.id); assert.equal(matches.length, 1); assert.equal(matches[0]?.confidence, 0.95); assert.equal(matches[0]?.state, 'confirmed')
  assert.ok(matches[0]?.signals.includes('auto-confirmed')); assert.equal(matches[0]?.history.length, 1); assert.equal(matches[0]?.history[0]?.actorId, 'system')
  const first = await platform.runAnalysis(sessionId, report.id, ruleset, 'US-CA'); const second = await platform.runAnalysis(sessionId, report.id, ruleset, 'US-CA'); assert.equal(first.findings.length, 1); assert.deepEqual(first.findings.map(({ id: _id, ...finding }) => finding), second.findings.map(({ id: _id, ...finding }) => finding)); assert.equal(first.findings[0]?.classification, 'verification-recommended'); assert.equal(first.audit[0]?.outcome, 'triggered'); assert.match(first.findings[0]?.alternativeExplanations[0] ?? '', /different dates/i)
  const consumerReport = await platform.createConsumerReport(sessionId, first.id); assert.match(consumerReport.limitations.join(' '), /No legal verdict/); assert.equal(consumerReport.overview.tradelines, 2); const action = consumerReport.actions[0]!; const updated = await platform.updateAction(sessionId, consumerReport.id, action.id, { status: 'under-review', note: 'Gathering statement', documents: ['Recent creditor statement'] }); assert.equal(updated.status, 'under-review')
})

test('ticket 06 hardening: oversized collision sets require consumer-confirmed subgroups', async () => {
  const { platform, sessionId, workspace } = await setup()
  const initialized = await platform.initializeUpload(sessionId, workspace.id)
  const oversize = {
    ...structuredClone(reportInput),
    tradelines: [
      { bureau: 'equifax' as Bureau, creditor: 'Store Card', account: '10001234', accountType: 'revolving', balance: 10000, status: 'open', opened: '2020-01', updated: '2026-06-30' },
      { bureau: 'experian' as Bureau, creditor: 'Store Card', account: '20001234', accountType: 'revolving', balance: 10500, status: 'open', opened: '2020-01', updated: '2026-06-28' },
      { bureau: 'transunion' as Bureau, creditor: 'Store Card', account: '30001234', accountType: 'revolving', balance: 10250, status: 'open', opened: '2020-01', updated: '2026-06-27' },
      { bureau: 'equifax' as Bureau, creditor: 'Store Card', account: '40001234', accountType: 'revolving', balance: 10100, status: 'open', opened: '2020-01', updated: '2026-06-26' },
    ],
  }
  const upload = await platform.completeUpload({ uploadId: initialized.id, token: initialized.token, fileName: 'oversized.html', mediaType: 'text/html', bytes: Buffer.from(`<html>GOLDEN-AUDIT-REPORT:${JSON.stringify(oversize)}</body></html>`) })
  const report = await platform.parseReport(sessionId, upload.id)
  await completeAllReviewValues(platform, sessionId, report.id)
  const matches = await platform.proposeMatches(sessionId, report.id)
  assert.equal(matches.length, 1)
  assert.equal(matches[0]?.state, 'split')
  assert.equal(matches[0]?.confidence, 0.72)
  assert.ok(matches[0]?.signals.includes('collision-set'))
  await assert.rejects(() => platform.decideMatch(sessionId, matches[0]!.id, 'confirmed', 'too broad'), /Oversized collision sets require subgroup confirmation/)
  const subgroup = await platform.confirmMatchSubgroup(sessionId, matches[0]!.id, matches[0]!.tradelineIds.slice(0, 2), 'consumer confirmed subgroup')
  assert.equal(subgroup.state, 'confirmed')
  assert.equal(subgroup.tradelineIds.length, 2)
  const ruleset = publishFixtureRules(platform)
  const analysis = await platform.runAnalysis(sessionId, report.id, ruleset, 'US-CA')
  assert.equal(analysis.findings.length, 1)
})

test('ticket 07 suppression: low-confidence evidence does not create a weak finding', async () => {
  const lowConfidence = { ...structuredClone(reportInput), tradelines: structuredClone(reportInput.tradelines).map((line, index) => index === 0 ? { ...line, confidence: 0.4 } : line) }
  const { platform, sessionId, workspace } = await setup(); const initialized = await platform.initializeUpload(sessionId, workspace.id); const upload = await platform.completeUpload({ uploadId: initialized.id, token: initialized.token, fileName: 'low.html', mediaType: 'text/html', bytes: Buffer.from(`<html>GOLDEN-AUDIT-REPORT:${JSON.stringify(lowConfidence)}</body></html>`) }); const report = await platform.parseReport(sessionId, upload.id); await completeAllReviewValues(platform, sessionId, report.id); const match = (await platform.proposeMatches(sessionId, report.id))[0]!; await platform.decideMatch(sessionId, match.id, 'confirmed', 'fixture'); const analysis = await platform.runAnalysis(sessionId, report.id, publishFixtureRules(platform), 'US-CA'); assert.equal(analysis.findings.length, 0); assert.equal(analysis.audit[0]?.outcome, 'suppressed')
})

test('Phase 5: supported Slice 2 values survive parsing, review lookup, report coverage, and masked export without a DOFD finding', async () => {
  const sliceTwoInput = {
    ...structuredClone(reportInput),
    tradelines: structuredClone(reportInput.tradelines).map((line, index) => ({ ...line, dateOfFirstDelinquency: index === 0 ? '2021-02' : undefined, paymentHistory: [{ yearMonth: '2026-01', status: 'C' }, { yearMonth: '2025-12', status: '30' }], remarks: ['Consumer disputes this account'], specialCommentCodes: ['AW'] })),
  }
  const { platform, sessionId, workspace } = await setup()
  const initialized = await platform.initializeUpload(sessionId, workspace.id)
  const upload = await platform.completeUpload({ uploadId: initialized.id, token: initialized.token, fileName: 'slice-two.html', mediaType: 'text/html', bytes: Buffer.from(`<html>GOLDEN-AUDIT-REPORT:${JSON.stringify(sliceTwoInput)}</body></html>`) })
  const report = await platform.parseReport(sessionId, upload.id)
  const first = report.tradelines[0]!
  assert.equal(first.dateOfFirstDelinquency.normalized, '2021-02')
  assert.deepEqual(first.paymentHistory.map(cell => cell.yearMonth), ['2026-01', '2025-12'])
  assert.equal(first.remarks[0]?.normalized, 'Consumer disputes this account')
  assert.equal(first.specialCommentCodes[0]?.normalized, 'AW')
  assert.equal((await platform.getSourceSnippet(sessionId, report.id, first.specialCommentCodes[0]!.id)).locator, '0:specialCommentCode:0')
  await completeAllReviewValues(platform, sessionId, report.id)
  const match = (await platform.proposeMatches(sessionId, report.id))[0]!
  await platform.decideMatch(sessionId, match.id, 'confirmed', 'fixture')
  const analysis = await platform.runAnalysis(sessionId, report.id, publishFixtureRules(platform), 'US-CA')
  const consumerReport = await platform.createConsumerReport(sessionId, analysis.id)
  const fields = new Map(consumerReport.content?.parserFields.map(field => [field.field, field]))
  const accountRows = consumerReport.content?.accountRows ?? []
  assert.equal(accountRows.length, 2)
  assert.equal(accountRows[0]?.cells.find(cell => cell.label === 'Creditor')?.value, 'Example Bank')
  assert.equal(accountRows[0]?.cells.some(cell => cell.label === 'Account'), false)
  assert.match(accountRows[0]?.cells.find(cell => cell.label === 'Creditor')?.source.locator ?? '', /^0:creditor$/)
  assert.equal(accountRows[0]?.cells.some(cell => cell.label === 'Date of first delinquency'), true)
  assert.equal(accountRows.some(row => row.cells.some(cell => cell.label.toLowerCase().includes('inquiry'))), false)
  assert.equal(fields.get('dateOfFirstDelinquency')?.capability, 'supported')
  assert.equal(fields.get('paymentHistory')?.states.known, 4)
  assert.equal(fields.get('remarks')?.states.known, 2)
  assert.equal(fields.get('specialCommentCodes')?.states.known, 2)
  assert.equal(consumerReport.findings.some(finding => /delinquen|re-aging/i.test(finding.title)), false)
  const exported = await platform.createExport(sessionId, consumerReport.id)
  assert.match(exported.content, /dateOfFirstDelinquency/)
  assert.match(exported.content, /paymentHistory/)
  assert.match(exported.content, /accountRows/)
  assert.doesNotMatch(exported.content, /12345678/)
})
test('extended-analysis snapshots retain only source-backed score and inquiry rows', async () => {
  const { platform, sessionId, workspace } = await setup()
  const { report } = await uploadAndParse(platform, sessionId, workspace.id)
  await completeAllReviewValues(platform, sessionId, report.id)
  const match = (await platform.proposeMatches(sessionId, report.id))[0]!
  await platform.decideMatch(sessionId, match.id, 'confirmed', 'fixture')
  const analysis = await platform.runAnalysis(sessionId, report.id, publishFixtureRules(platform), 'US-CA')
  const consumerReport = await platform.createConsumerReport(sessionId, analysis.id)
  assert.equal(consumerReport.content?.scoreRows, undefined)
  assert.equal(consumerReport.content?.scoreRows, undefined)
  assert.equal(consumerReport.content?.inquiryRows, undefined)
  assert.equal(consumerReport.content?.parserFields.find(field => field.field === 'score')?.states.known, 1)
  assert.equal(consumerReport.content?.parserFields.find(field => field.field === 'score')?.states.unknown, 1)
  assert.equal(consumerReport.content?.parserFields.find(field => field.field === 'inquiry')?.states.known, 1)
  assert.equal(consumerReport.content?.parserFields.find(field => field.field === 'inquiry')?.states.unknown, 1)
  const exported = await platform.createExport(sessionId, consumerReport.id)
  assert.doesNotMatch(exported.content, /scoreRows/)
  assert.doesNotMatch(exported.content, /inquiryRows/)
})

test('tickets 09-10: masked idempotent export, scoped deletion, and safe narration fallback', async () => {
  const { platform, sessionId, workspace } = await setup(); const { report } = await uploadAndParse(platform, sessionId, workspace.id); await completeAllReviewValues(platform, sessionId, report.id); const match = (await platform.proposeMatches(sessionId, report.id))[0]!; await platform.decideMatch(sessionId, match.id, 'confirmed', 'verified'); const analysis = await platform.runAnalysis(sessionId, report.id, publishFixtureRules(platform), 'US-CA'); const consumerReport = await platform.createConsumerReport(sessionId, analysis.id)
  const firstExport = await platform.createExport(sessionId, consumerReport.id); const secondExport = await platform.createExport(sessionId, consumerReport.id); assert.equal(firstExport.id, secondExport.id); assert.doesNotMatch(firstExport.content, /12345678|\b\d{9}\b/); assert.match(firstExport.content, /Educational information only/)
  const fallback = await platform.narrate(sessionId, analysis.id, () => 'This illegal item will be deleted guaranteed'); assert.equal(fallback.mode, 'fallback'); assert.doesNotMatch(fallback.text, /guarantee|illegal/i)
  const generated = await platform.narrate(sessionId, analysis.id, () => 'Bureau balances differ. Different update dates can explain a difference'); assert.equal(generated.mode, 'generated')
  const deletion = await platform.requestDeletion(sessionId, true); assert.equal(deletion.status, 'pending-provider'); assert.ok(deletion.deleted.some(item => item.startsWith('uploads:'))); assert.deepEqual(deletion.delayed, ['backup-lifecycle', 'model-provider'])
})
