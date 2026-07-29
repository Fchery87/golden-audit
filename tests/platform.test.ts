import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { CreditAnalysisPlatform, type Bureau } from '../packages/platform/src/index.js'

const password = 'correct horse battery staple'
const consent = { version: '2026-01', adultUSConsumer: true, authorizedReportUse: true, educationalLimitations: true, sensitiveDataHandling: true, residence: 'US-CA', analysisJurisdiction: 'US-CA' } as const
const reportInput = {
  provider: 'synthetic-provider', template: 'pilot-v1', reportDate: '2026-07-01', identity: ['A Consumer'], addresses: ['1 Main St'], employers: [], inquiries: ['Example Bank 2026-06'], publicRecords: [], scores: [700], remarks: [],
  tradelines: [
    { bureau: 'equifax' as Bureau, creditor: 'Example Bank', account: '12345678', accountType: 'revolving', balance: 12500, status: 'open', opened: '2020-01', updated: '2026-06-30' },
    { bureau: 'experian' as Bureau, creditor: 'Example Bank', account: '12345678', accountType: 'revolving', balance: 15000, status: 'open', opened: '2020-01', updated: '2026-06-28' },
  ],
}

// === Wiring proof: the proven IdentityIQ PDF adapter is now the LIVE ingestion path (ticket 13). ===
// Uploads a real (gitignored) IdentityIQ PDF through the full platform flow and asserts it routed through
// the REAL adapter — not the synthetic fixture marker. Structure-only; never asserts or prints values.
const WIRING_PDFS = [
  'docs/reports/Credit Report - IdentityIQ.pdf',
  'docs/reports/Credit Report - IdentityIQ (copy).pdf',
  'docs/reports/Credit Report - IdentityIQ (another copy).pdf',
  'docs/reports/C_Pique_Credit Report - IdentityIQ.pdf',
]
test('wiring: completeUpload(pdf) → parseReport routes through the real IdentityIQ adapter', { skip: !hasBin('pdftotext') }, () => {
  let checkedAny = false; const failed: string[] = []
  for (const p of WIRING_PDFS) {
    if (!existsSync(p)) continue
    checkedAny = true
    const { platform, sessionId, workspace } = setup()
    const init = platform.initializeUpload(sessionId, workspace.id)
    const completed = platform.completeUpload({ uploadId: init.id, token: init.token, fileName: p.split('/').pop() ?? p, mediaType: 'application/pdf', bytes: readFileSync(p) })
    if (completed.stage !== 'ready-to-parse' || completed.mediaType !== 'application/pdf' || completed.scanResult !== 'clean') { failed.push(`${p}: upload stage/media/scan`); continue }
    if (completed.sanitizedContent !== undefined) failed.push(`${p}: PDF upload must NOT carry sanitizedContent (PII hygiene)`) // bytes live in a private map, never on the returned Upload
    const report = platform.parseReport(sessionId, completed.id)
    const bureaus = new Set(report.tradelines.map(t => t.balance.bureau))
    const realAdapter = report.provider === 'identityiq' && report.template === 'identityiq-pdf-v1' // NOT 'synthetic-provider'/'pilot-v1'
    const threeBureaus = bureaus.has('transunion') && bureaus.has('experian') && bureaus.has('equifax')
    const usdBalances = report.tradelines.every(t => t.balance.currency === 'USD' && t.balance.state === 'known')
    if (!realAdapter || report.tradelines.length === 0 || !threeBureaus || !usdBalances) failed.push(`${p}: provider=${report.provider} template=${report.template} tradelines=${report.tradelines.length} bureaus=[${[...bureaus].join(',')}] usd=${usdBalances}`)
    // assert NOTHING about balance amounts or account numbers — structure only.
  }
  if (!checkedAny) return // all real files absent (gitignored) → pass vacuously in CI
  assert.equal(failed.length, 0, `wiring proof failures: ${failed.join('; ') || '(none)'}`)
})

function hasBin(bin: string): boolean { try { execSync(`command -v ${bin}`, { stdio: 'ignore' }); return true } catch { return false } }

function setup() {
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
  const account = platform.register({ email: 'consumer@example.com', password })
  const workspace = platform.recordConsent(account.sessionId, consent)
  platform.acceptAuthorization(account.sessionId) // FCRA counsel Q-L3: written authorization before processing
  return { platform, ...account, workspace }
}

function uploadAndParse(platform: CreditAnalysisPlatform, sessionId: string, workspaceId: string) {
  const initialized = platform.initializeUpload(sessionId, workspaceId)
  const bytes = Buffer.from(`<html>GOLDEN-AUDIT-REPORT:${JSON.stringify(reportInput)}</body></html>`)
  const upload = platform.completeUpload({ uploadId: initialized.id, token: initialized.token, fileName: 'report.html', mediaType: 'text/html', bytes })
  return { upload, report: platform.parseReport(sessionId, upload.id) }
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

test('ticket 02: account consent gate, session revocation, and tenant isolation fail closed', () => {
  const { platform, sessionId, workspace } = setup()
  assert.equal(platform.getWorkspace(sessionId, workspace.id).userId, workspace.userId)
  const other = platform.register({ email: 'other@example.com', password })
  assert.throws(() => platform.getWorkspace(other.sessionId, workspace.id), /Not found/)
  assert.throws(() => platform.initializeUpload(other.sessionId, workspace.id), /Not found/)
  platform.revokeSession(sessionId)
  assert.throws(() => platform.getWorkspace(sessionId, workspace.id), /Authentication required/)
  const signedIn = platform.signIn({ email: 'consumer@example.com', password })
  assert.equal(platform.getWorkspace(signedIn, workspace.id).id, workspace.id)
})

test('launch scope: consent requires an approved state and configured launch scope', () => {
  const platform = new CreditAnalysisPlatform()
  const { sessionId } = platform.register({ email: 'scope@example.com', password })
  assert.throws(() => platform.recordConsent(sessionId, consent), /Launch scope is not configured/)
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
  assert.doesNotThrow(() => platform.recordConsent(sessionId, consent))
  const other = platform.register({ email: 'scope-other@example.com', password })
  assert.throws(() => platform.recordConsent(other.sessionId, { ...consent, residence: 'US-NY', analysisJurisdiction: 'US-NY' }), /Jurisdiction is not enabled for the pilot/)
})

test('ticket 03: private ingestion validates, quarantines, expires, and deduplicates safely', () => {
  const { platform, sessionId, workspace } = setup()
  const first = platform.initializeUpload(sessionId, workspace.id)
  const bytes = Buffer.from(`<html>GOLDEN-AUDIT-REPORT:${JSON.stringify(reportInput)}</body></html>`)
  const completed = platform.completeUpload({ uploadId: first.id, token: first.token, fileName: 'report.html', mediaType: 'text/html', bytes })
  assert.equal(completed.stage, 'ready-to-parse'); assert.equal(completed.scanResult, 'clean'); assert.match(completed.sourceHash ?? '', /^[a-f0-9]{64}$/); assert.equal(completed.retentionClass, 'consumer-report')
  const retry = platform.completeUpload({ uploadId: first.id, token: first.token, fileName: 'report.html', mediaType: 'text/html', bytes }); assert.equal(retry.id, completed.id)
  const unsafe = platform.initializeUpload(sessionId, workspace.id); const quarantined = platform.completeUpload({ uploadId: unsafe.id, token: unsafe.token, fileName: 'bad.html', mediaType: 'text/html', bytes: Buffer.from('<html><script>EICAR</script></html>') }); assert.equal(quarantined.stage, 'quarantined'); assert.doesNotMatch(quarantined.failureMessage ?? '', /stack|Error:/)
  const mismatch = platform.initializeUpload(sessionId, workspace.id); assert.equal(platform.completeUpload({ uploadId: mismatch.id, token: mismatch.token, fileName: 'fake.pdf', mediaType: 'application/pdf', bytes: Buffer.from('<html></html>') }).stage, 'final-failure')
  const expired = platform.initializeUpload(sessionId, workspace.id, -1); assert.throws(() => platform.completeUpload({ uploadId: expired.id, token: expired.token, fileName: 'x.pdf', mediaType: 'application/pdf', bytes: Buffer.from('%PDF-safe') }), /expired/)
})

test('ticket 04: parsing preserves bureau provenance, masks identifiers, and audits corrections', () => {
  const { platform, sessionId, workspace } = setup(); const { report } = uploadAndParse(platform, sessionId, workspace.id)
  assert.equal(report.parserVersion, 'fixture-adapter@1'); assert.equal(report.tradelines.length, 2); assert.notEqual(report.tradelines[0]?.balance.bureau, report.tradelines[1]?.balance.bureau); assert.equal(report.tradelines[0]?.maskedAccount.normalized, '••••5678'); assert.equal(report.tradelines[0]?.opened.datePrecision, 'month'); assert.equal(report.tradelines[0]?.balance.currency, 'USD')
  const balance = report.tradelines[0]?.balance; assert.ok(balance); assert.equal(platform.getSourceSnippet(sessionId, report.id, balance.id).locator, '0:balance')
  const corrected = platform.reviewValue(sessionId, report.id, balance.id, { decision: 'corrected', reason: 'Compared with statement', replacement: 12000 }); assert.equal(corrected.normalizedVersion, 2); assert.equal(corrected.tradelines[0]?.balance.review?.replacement, 12000); assert.equal(corrected.tradelines[0]?.balance.originalDisplay, '$125.00')
})

test('ticket 05: governance publishes only approved immutable effective content', () => {
  const platform = new CreditAnalysisPlatform(); const version = publishFixtureRules(platform); const effective = platform.getEffectiveRules('US-CA', '2026-07-01'); assert.equal(effective.length, 1); assert.equal(effective[0]?.version, version); assert.equal(effective[0]?.status, 'published'); assert.equal(platform.getEffectiveAuthorities('US-CA', '2026-07-01').length, 1); assert.equal(platform.getEffectiveEducationModules('US-CA', '2026-07-01').length, 1)
  assert.throws(() => platform.createRule('intruder', { name: 'unauthorized', jurisdiction: 'US-CA', effectiveFrom: '2020-01-01', requiredInputs: ['balance'], minimumConfidence: 1, classification: 'observed-fact', limitations: [], authorityIds: [], educationModuleIds: [], testCases: ['fixture'] }), /not authorized/)
  assert.throws(() => platform.createRule('reviewer-2', { name: 'incomplete', jurisdiction: 'US-CA', effectiveFrom: '2020-01-01', requiredInputs: [], minimumConfidence: 1, classification: 'observed-fact', limitations: [], authorityIds: [], educationModuleIds: [], testCases: [] }), /incomplete/)
})

test('tickets 06-08: confirmed matching drives deterministic findings and user-controlled report actions', () => {
  const { platform, sessionId, workspace } = setup(); const { report } = uploadAndParse(platform, sessionId, workspace.id); const ruleset = publishFixtureRules(platform); platform.completeReview(sessionId, report.id)
  const matches = platform.proposeMatches(sessionId, report.id); assert.equal(matches.length, 1); assert.equal(matches[0]?.confidence, 0.72); assert.equal(matches[0]?.state, 'split')
  const confirmed = platform.decideMatch(sessionId, matches[0]!.id, 'confirmed', 'Same account verified by consumer'); assert.equal(confirmed.history.length, 1)
  const first = platform.runAnalysis(sessionId, report.id, ruleset, 'US-CA'); const second = platform.runAnalysis(sessionId, report.id, ruleset, 'US-CA'); assert.equal(first.findings.length, 1); assert.deepEqual(first.findings.map(({ id: _id, ...finding }) => finding), second.findings.map(({ id: _id, ...finding }) => finding)); assert.equal(first.findings[0]?.classification, 'verification-recommended'); assert.equal(first.audit[0]?.outcome, 'triggered'); assert.match(first.findings[0]?.alternativeExplanations[0] ?? '', /different dates/i)
  const consumerReport = platform.createConsumerReport(sessionId, first.id); assert.match(consumerReport.limitations.join(' '), /No legal verdict/); assert.equal(consumerReport.overview.tradelines, 2); const action = consumerReport.actions[0]!; const updated = platform.updateAction(sessionId, consumerReport.id, action.id, { status: 'under-review', note: 'Gathering statement', documents: ['Recent creditor statement'] }); assert.equal(updated.status, 'under-review')
})

test('ticket 06 hardening: oversized collision sets require consumer-confirmed subgroups', () => {
  const { platform, sessionId, workspace } = setup()
  const initialized = platform.initializeUpload(sessionId, workspace.id)
  const oversize = {
    ...structuredClone(reportInput),
    tradelines: [
      { bureau: 'equifax' as Bureau, creditor: 'Store Card', account: '10001234', accountType: 'revolving', balance: 10000, status: 'open', opened: '2020-01', updated: '2026-06-30' },
      { bureau: 'experian' as Bureau, creditor: 'Store Card', account: '20001234', accountType: 'revolving', balance: 10500, status: 'open', opened: '2020-01', updated: '2026-06-28' },
      { bureau: 'transunion' as Bureau, creditor: 'Store Card', account: '30001234', accountType: 'revolving', balance: 10250, status: 'open', opened: '2020-01', updated: '2026-06-27' },
      { bureau: 'equifax' as Bureau, creditor: 'Store Card', account: '40001234', accountType: 'revolving', balance: 10100, status: 'open', opened: '2020-01', updated: '2026-06-26' },
    ],
  }
  const upload = platform.completeUpload({ uploadId: initialized.id, token: initialized.token, fileName: 'oversized.html', mediaType: 'text/html', bytes: Buffer.from(`<html>GOLDEN-AUDIT-REPORT:${JSON.stringify(oversize)}</body></html>`) })
  const report = platform.parseReport(sessionId, upload.id)
  platform.completeReview(sessionId, report.id)
  const matches = platform.proposeMatches(sessionId, report.id)
  assert.equal(matches.length, 1)
  assert.equal(matches[0]?.state, 'split')
  assert.equal(matches[0]?.confidence, 0.72)
  assert.ok(matches[0]?.signals.includes('collision-set'))
  assert.throws(() => platform.decideMatch(sessionId, matches[0]!.id, 'confirmed', 'too broad'), /Oversized collision sets require subgroup confirmation/)
  const subgroup = platform.confirmMatchSubgroup(sessionId, matches[0]!.id, matches[0]!.tradelineIds.slice(0, 2), 'consumer confirmed subgroup')
  assert.equal(subgroup.state, 'confirmed')
  assert.equal(subgroup.tradelineIds.length, 2)
  const ruleset = publishFixtureRules(platform)
  const analysis = platform.runAnalysis(sessionId, report.id, ruleset, 'US-CA')
  assert.equal(analysis.findings.length, 1)
})

test('ticket 07 suppression: low-confidence evidence does not create a weak finding', () => {
  const lowConfidence = { ...structuredClone(reportInput), tradelines: structuredClone(reportInput.tradelines).map((line, index) => index === 0 ? { ...line, confidence: 0.4 } : line) }
  const { platform, sessionId, workspace } = setup(); const initialized = platform.initializeUpload(sessionId, workspace.id); const upload = platform.completeUpload({ uploadId: initialized.id, token: initialized.token, fileName: 'low.html', mediaType: 'text/html', bytes: Buffer.from(`<html>GOLDEN-AUDIT-REPORT:${JSON.stringify(lowConfidence)}</body></html>`) }); const report = platform.parseReport(sessionId, upload.id); platform.completeReview(sessionId, report.id); const match = platform.proposeMatches(sessionId, report.id)[0]!; platform.decideMatch(sessionId, match.id, 'confirmed', 'fixture'); const analysis = platform.runAnalysis(sessionId, report.id, publishFixtureRules(platform), 'US-CA'); assert.equal(analysis.findings.length, 0); assert.equal(analysis.audit[0]?.outcome, 'suppressed')
})

test('tickets 09-10: masked idempotent export, scoped deletion, and safe narration fallback', () => {
  const { platform, sessionId, workspace } = setup(); const { report } = uploadAndParse(platform, sessionId, workspace.id); platform.completeReview(sessionId, report.id); const match = platform.proposeMatches(sessionId, report.id)[0]!; platform.decideMatch(sessionId, match.id, 'confirmed', 'verified'); const analysis = platform.runAnalysis(sessionId, report.id, publishFixtureRules(platform), 'US-CA'); const consumerReport = platform.createConsumerReport(sessionId, analysis.id)
  const firstExport = platform.createExport(sessionId, consumerReport.id); const secondExport = platform.createExport(sessionId, consumerReport.id); assert.equal(firstExport.id, secondExport.id); assert.doesNotMatch(firstExport.content, /12345678|\b\d{9}\b/); assert.match(firstExport.content, /Educational information only/)
  const fallback = platform.narrate(sessionId, analysis.id, () => 'This illegal item will be deleted guaranteed'); assert.equal(fallback.mode, 'fallback'); assert.doesNotMatch(fallback.text, /guarantee|illegal/i)
  const generated = platform.narrate(sessionId, analysis.id, () => 'Bureau balances differ. Different update dates can explain a difference'); assert.equal(generated.mode, 'generated')
  const deletion = platform.requestDeletion(sessionId, true); assert.equal(deletion.status, 'pending-provider'); assert.ok(deletion.deleted.some(item => item.startsWith('uploads:'))); assert.deepEqual(deletion.delayed, ['backup-lifecycle', 'model-provider'])
})
