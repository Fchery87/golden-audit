import test from 'node:test'
import assert from 'node:assert/strict'
import { CreditAnalysisPlatform, type Bureau } from '../packages/platform/src/index.js'

const password = 'correct horse battery staple'
const consent = { version: '2026-01', adultUSConsumer: true, authorizedReportUse: true, educationalLimitations: true, sensitiveDataHandling: true, residence: 'US-CA', analysisJurisdiction: 'US-CA' } as const

async function setup(email: string, analysisJurisdiction: 'US-CA' | 'US-NY' = 'US-CA') {
  const platform = new CreditAnalysisPlatform()
  platform.configureLaunchScope({
    mode: 'small-reviewed-state-subset',
    approvedStates: ['US-CA', 'US-NY'],
    stateSelectionEvidenceReference: 'docs/launch-scope-decision-memo.md',
    availabilityClaim: 'Pilot limited to reviewed states only.',
    pricingMode: 'free-pilot-only',
    nationwideStatus: 'state-by-state-review',
    notes: 'Analysis-only, educational, consumer-uploaded, consumer-only boundary.',
  })
  const inviteCode = await platform.issueInvite()
  const account = await platform.register({ email, password, inviteCode })
  const workspace = await platform.recordConsent(account.sessionId, { ...consent, residence: analysisJurisdiction, analysisJurisdiction })
  await platform.acceptAuthorization(account.sessionId)
  return { platform, ...account, workspace }
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

async function runSyntheticAnalysis(platform: CreditAnalysisPlatform, sessionId: string, workspaceId: string, input: { provider: string; template: string; jurisdiction?: 'US-CA' | 'US-NY'; tradelines: Array<{ bureau: Bureau; creditor: string; account: string; balance: number; updated: string }> }) {
  const initialized = await platform.initializeUpload(sessionId, workspaceId)
  const bytes = Buffer.from(`<html>GOLDEN-AUDIT-REPORT:${JSON.stringify({
    provider: input.provider,
    template: input.template,
    reportDate: '2026-07-01',
    identity: ['A Consumer'],
    addresses: ['1 Main St'],
    employers: [],
    inquiries: [],
    publicRecords: [],
    scores: [700],
    remarks: [],
    tradelines: input.tradelines.map(line => ({
      bureau: line.bureau,
      creditor: line.creditor,
      account: line.account,
      accountType: 'revolving',
      balance: line.balance,
      status: 'open',
      opened: '2020-01',
      updated: line.updated,
    })),
  })}</body></html>`)
  const upload = await platform.completeUpload({ uploadId: initialized.id, token: initialized.token, fileName: 'report.html', mediaType: 'text/html', bytes })
  const report = await platform.parseReport(sessionId, upload.id)
  await confirmAllReviewValues(platform, sessionId, report.id)
  const proposed = await platform.proposeMatches(sessionId, report.id)
  for (const match of proposed) await platform.decideMatch(sessionId, match.id, 'confirmed', 'quality measurement fixture')
  const analysis = await platform.runAnalysis(sessionId, report.id, publishFixtureRules(platform), input.jurisdiction ?? 'US-CA')
  return { upload, report, proposed, analysis }
}

async function confirmAllReviewValues(platform: CreditAnalysisPlatform, sessionId: string, reportId: string): Promise<void> {
  const review = await platform.getValueReview(sessionId, reportId)
  for (const value of review.values) await platform.reviewValue(sessionId, reportId, value.id, { decision: 'confirmed', reason: 'Synthetic or measurement fixture confirmation.' })
  await platform.completeReview(sessionId, reportId)
}


test('quality reporting: segments metrics by provider, document type, and jurisdiction with latency summaries', async () => {
  const { platform, sessionId, workspace } = await setup('quality-a@example.com', 'US-CA')
  await runSyntheticAnalysis(platform, sessionId, workspace.id, {
    provider: 'synthetic-provider',
    template: 'pilot-v1',
    tradelines: [
      { bureau: 'equifax', creditor: 'Example Bank', account: '12345678', balance: 12500, updated: '2026-06-30' },
      { bureau: 'experian', creditor: 'Example Bank', account: '12345678', balance: 15000, updated: '2026-06-28' },
    ],
  })
  await runSyntheticAnalysis(platform, sessionId, workspace.id, {
    provider: 'synthetic-provider',
    template: 'pilot-v2',
    tradelines: [
      { bureau: 'equifax', creditor: 'Card One', account: '98765432', balance: 10000, updated: '2026-06-30' },
      { bureau: 'experian', creditor: 'Card One', account: '98765432', balance: 10000, updated: '2026-06-30' },
    ],
  })

  const report = await platform.getQualityReport()
  assert.equal(report.segments.length, 1)
  const segment = report.segments[0]!
  assert.equal(segment.provider, 'synthetic-provider')
  assert.equal(segment.documentType, 'html')
  assert.equal(segment.jurisdiction, 'US-CA')
  assert.equal(segment.uploads, 2)
  assert.equal(segment.parsedReports, 2)
  assert.equal(segment.analyses, 2)
  assert.equal(segment.findings.total, 1)
  assert.equal(segment.findings.averagePerAnalysis, 0.5)
  assert.equal(segment.findings.bySeverity.medium, 1)
  assert.equal(segment.findings.bySeverity.low, 0)
  assert.equal(segment.matching.proposedGroups, 2)
  assert.equal(segment.matching.confirmedGroups, 2)
  assert.equal(segment.matching.highConfidenceProposals, 1)
  assert.equal(segment.matching.splitGroups, 1)
  assert.equal(segment.parser.averageTradelinesPerReport, 2)
  assert.equal(segment.parser.reportsWithTradelines, 2)
  assert.ok(segment.latency.uploadToParse.averageMs >= 0)
  assert.ok(segment.latency.parseToAnalysis.averageMs >= 0)
})

test('quality reporting: keeps segments separate by jurisdiction and includes empty-finding analyses', async () => {
  const first = await setup('quality-b@example.com', 'US-CA')
  await runSyntheticAnalysis(first.platform, first.sessionId, first.workspace.id, {
    provider: 'synthetic-provider',
    template: 'pilot-v1',
    tradelines: [
      { bureau: 'equifax', creditor: 'Alpha Bank', account: '12345678', balance: 12500, updated: '2026-06-30' },
      { bureau: 'experian', creditor: 'Alpha Bank', account: '12345678', balance: 15000, updated: '2026-06-28' },
    ],
  })

  const second = await setup('quality-c@example.com', 'US-NY')
  await runSyntheticAnalysis(second.platform, second.sessionId, second.workspace.id, {
    provider: 'synthetic-provider',
    template: 'pilot-v1',
    jurisdiction: 'US-NY',
    tradelines: [
      { bureau: 'equifax', creditor: 'Bravo Card', account: '87654321', balance: 10000, updated: '2026-06-30' },
      { bureau: 'experian', creditor: 'Bravo Card', account: '87654321', balance: 10000, updated: '2026-06-30' },
    ],
  })

  const caSegment = (await first.platform.getQualityReport()).segments[0]!
  assert.equal(caSegment.jurisdiction, 'US-CA')
  assert.equal(caSegment.findings.total, 1)

  const nySegment = (await second.platform.getQualityReport()).segments[0]!
  assert.equal(nySegment.jurisdiction, 'US-NY')
  assert.equal(nySegment.analyses, 1)
  assert.equal(nySegment.findings.total, 0)
  assert.equal(nySegment.findings.averagePerAnalysis, 0)
  assert.equal(nySegment.findings.byClassification['verification-recommended'], 0)
})
