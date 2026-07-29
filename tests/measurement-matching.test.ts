import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { CreditAnalysisPlatform, type Bureau } from '../packages/platform/src/index.js'

const password = 'correct horse battery staple'
const consent = { version: '2026-01', adultUSConsumer: true, authorizedReportUse: true, educationalLimitations: true, sensitiveDataHandling: true, residence: 'US-CA', analysisJurisdiction: 'US-CA' } as const
const WIRING_PDFS = [
  'docs/reports/Credit Report - IdentityIQ.pdf',
  'docs/reports/Credit Report - IdentityIQ (copy).pdf',
  'docs/reports/Credit Report - IdentityIQ (another copy).pdf',
  'docs/reports/C_Pique_Credit Report - IdentityIQ.pdf',
]

type InputTradeline = { bureau: Bureau; creditor: string; account: string; balance: number; status?: string; opened?: string; updated?: string; accountType?: string }

function hasBin(bin: string): boolean { try { execSync(`command -v ${bin}`, { stdio: 'ignore' }); return true } catch { return false } }
function maskAccount(value: string): string { return `••••${value.replace(/\D/g, '').slice(-4)}` }
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
  const account = platform.register({ email: 'measure-matching@example.com', password })
  const workspace = platform.recordConsent(account.sessionId, consent)
  platform.acceptAuthorization(account.sessionId)
  return { platform, ...account, workspace }
}
function makeFixture(tradelines: InputTradeline[]) {
  return {
    provider: 'synthetic-provider', template: 'match-measurement-v1', reportDate: '2026-07-01', identity: ['A Consumer'], addresses: ['1 Main St'], employers: [], inquiries: [], publicRecords: [], scores: [700], remarks: [],
    tradelines: tradelines.map(t => ({ bureau: t.bureau, creditor: t.creditor, account: t.account, accountType: t.accountType ?? 'revolving', balance: t.balance, status: t.status ?? 'open', opened: t.opened ?? '2020-01', updated: t.updated ?? '2026-06-30' })),
  }
}
function uploadAndPropose(tradelines: InputTradeline[]) {
  const { platform, sessionId, workspace } = setup()
  const initialized = platform.initializeUpload(sessionId, workspace.id)
  const bytes = Buffer.from(`<html>GOLDEN-AUDIT-REPORT:${JSON.stringify(makeFixture(tradelines))}</body></html>`)
  const upload = platform.completeUpload({ uploadId: initialized.id, token: initialized.token, fileName: 'match.html', mediaType: 'text/html', bytes })
  const report = platform.parseReport(sessionId, upload.id)
  platform.completeReview(sessionId, report.id)
  const matches = platform.proposeMatches(sessionId, report.id)
  return { report, matches }
}
function memberKey(line: { balance: { bureau: Bureau }; creditor: { normalized: string | null }; maskedAccount: { normalized: string | null } }): string {
  return `${line.balance.bureau}|${line.creditor.normalized ?? '?'}|${line.maskedAccount.normalized ?? '?'}`
}
function matchSignature(report: { tradelines: Array<{ id: string; balance: { bureau: Bureau }; creditor: { normalized: string | null }; maskedAccount: { normalized: string | null } }> }, match: { tradelineIds: string[]; confidence: number; state: string }): string {
  const byId = new Map(report.tradelines.map(t => [t.id, t]))
  const members: string[] = []
  for (const id of match.tradelineIds) {
    const line = byId.get(id)
    if (line) members.push(memberKey(line))
  }
  members.sort()
  return `${members.join('~')}|c=${match.confidence}|s=${match.state}`
}

// Ticket 15 — measurement harness for the CURRENT matching heuristic in platform.proposeMatches().
// True precision/recall require ground truth, so the synthetic corpus gives exact metrics by construction.
// Real PDFs have no labels, so that pass is structure-only (coverage/confidence/group-shape), never PPV claims.

test('measurement: matching heuristic precision = 1.0 and recall = 1.0 on the exact-signal corpus', () => {
  const tradelines: InputTradeline[] = [
    { bureau: 'equifax', creditor: 'Alpha Bank', account: '11111111', balance: 250000 },
    { bureau: 'experian', creditor: 'Alpha Bank', account: '11111111', balance: 250000 },
    { bureau: 'transunion', creditor: 'Beta Card', account: '22222222', balance: 10000 },
    { bureau: 'experian', creditor: 'Beta Card', account: '22222222', balance: 10500 },
    { bureau: 'equifax', creditor: 'Beta Card', account: '22222222', balance: 10250 },
    { bureau: 'equifax', creditor: 'Gamma Auto', account: '33333333', balance: 500000 },
    { bureau: 'experian', creditor: 'Gamma Auto', account: '44444444', balance: 500000 },
    { bureau: 'equifax', creditor: 'Delta Finance', account: '55555555', balance: 9900 },
    { bureau: 'experian', creditor: 'Delta Fin.', account: '55555555', balance: 9900 },
    { bureau: 'transunion', creditor: 'Solo Lender', account: '66666666', balance: 120000 },
  ]
  const { report, matches } = uploadAndPropose(tradelines)
  const actual = new Set(matches.map(m => matchSignature(report, m)))
  const expected = new Set([
    [
      `equifax|Alpha Bank|${maskAccount('11111111')}`,
      `experian|Alpha Bank|${maskAccount('11111111')}`,
    ].sort().join('~') + '|c=0.95|s=proposed',
    [
      `equifax|Beta Card|${maskAccount('22222222')}`,
      `experian|Beta Card|${maskAccount('22222222')}`,
      `transunion|Beta Card|${maskAccount('22222222')}`,
    ].sort().join('~') + '|c=0.72|s=split',
  ])
  const tp = [...actual].filter(sig => expected.has(sig)).length
  const precision = actual.size === 0 ? 1 : tp / actual.size
  const recall = expected.size === 0 ? 1 : tp / expected.size
  console.log(`  [match measurement] exact-signal corpus expected=${expected.size} proposed=${actual.size} recall=${recall.toFixed(2)} precision=${precision.toFixed(2)}`)
  assert.equal(matches.length, 2)
  assert.equal(precision, 1, `precision must be 1.0 — unexpected groups: ${[...actual].filter(sig => !expected.has(sig)).join('; ')}`)
  assert.equal(recall, 1, `recall must be 1.0 — missing groups: ${[...expected].filter(sig => !actual.has(sig)).join('; ')}`)
})

test('measurement: known limitation — creditor alias variation creates a recall miss', () => {
  // Same last-4 / same real account, but creditor strings differ. The current heuristic does not normalize
  // creditor aliases, so it deliberately misses this group. This test keeps the measurement HONEST about
  // what has and has not been proven by the exact-signal corpus.
  const { matches } = uploadAndPropose([
    { bureau: 'equifax', creditor: 'Example Bank', account: '77777777', balance: 880000 },
    { bureau: 'experian', creditor: 'Example Bank NA', account: '77777777', balance: 880000 },
  ])
  assert.equal(matches.length, 0, 'creditor alias variation should currently miss (documented recall limitation)')
})

test('measurement: known limitation — same creditor + same last4 can create a false match', () => {
  // The platform stores only MASKED account numbers in canonical tradelines, so matching currently uses
  // creditor + last4. Two different full accounts with the same last4 at the same creditor will therefore
  // falsely group. This is the current heuristic's clearest precision risk.
  const { matches } = uploadAndPropose([
    { bureau: 'equifax', creditor: 'Store Card', account: '10001234', balance: 420000 },
    { bureau: 'experian', creditor: 'Store Card', account: '99991234', balance: 420000 },
  ])
  assert.equal(matches.length, 1, 'same-creditor same-last4 should currently false-match (documented precision limitation)')
  assert.equal(matches[0]?.confidence, 0.95)
})

test('measurement: matching heuristic is deterministic for identical inputs', () => {
  const tradelines: InputTradeline[] = [
    { bureau: 'equifax', creditor: 'Alpha Bank', account: '11111111', balance: 250000 },
    { bureau: 'experian', creditor: 'Alpha Bank', account: '11111111', balance: 250000 },
    { bureau: 'transunion', creditor: 'Beta Card', account: '22222222', balance: 10000 },
    { bureau: 'experian', creditor: 'Beta Card', account: '22222222', balance: 10500 },
    { bureau: 'equifax', creditor: 'Beta Card', account: '22222222', balance: 10250 },
  ]
  const a = uploadAndPropose(tradelines)
  const b = uploadAndPropose(tradelines)
  assert.deepEqual(a.matches.map(m => matchSignature(a.report, m)).sort(), b.matches.map(m => matchSignature(b.report, m)).sort())
})

test('measurement: real-sample match profile (structure-only)', { skip: !hasBin('pdftotext') }, () => {
  let checkedAny = false
  const rows: string[] = []
  for (const path of WIRING_PDFS) {
    if (!existsSync(path)) continue
    checkedAny = true
    const { platform, sessionId, workspace } = setup()
    const init = platform.initializeUpload(sessionId, workspace.id)
    const upload = platform.completeUpload({ uploadId: init.id, token: init.token, fileName: path.split('/').pop() ?? 'report.pdf', mediaType: 'application/pdf', bytes: readFileSync(path) })
    const report = platform.parseReport(sessionId, upload.id)
    platform.completeReview(sessionId, report.id)
    const matches = platform.proposeMatches(sessionId, report.id)
    const matchedTradelineIds = new Set(matches.flatMap(m => m.tradelineIds))
    const size2 = matches.filter(m => m.tradelineIds.length === 2).length
    const size3 = matches.filter(m => m.tradelineIds.length === 3).length
    const oversized = matches.filter(m => m.tradelineIds.length > 3)
    const conf95 = matches.filter(m => m.confidence === 0.95).length
    const conf72 = matches.filter(m => m.confidence === 0.72).length
    const oversized95 = oversized.filter(m => m.confidence === 0.95).length
    for (const m of matches) {
      assert.ok(m.tradelineIds.length >= 2, 'proposed matches must cover at least 2 tradelines')
      assert.equal(m.state, m.confidence >= 0.9 ? 'proposed' : 'split')
    }
    assert.equal(conf95 + conf72, matches.length, 'all matches should fall into the current two confidence buckets')
    assert.equal(oversized95, 0, 'oversized collision groups must never remain at 0.95 after hardening')
    rows.push(`  ${path.split('/').pop()?.padEnd(46)} tradelines=${String(report.tradelines.length).padStart(3)} matches=${String(matches.length).padStart(3)} coverage=${String(matchedTradelineIds.size).padStart(3)}/${String(report.tradelines.length).padStart(3)} groups(2b/3b/>3)=${size2}/${size3}/${oversized.length} confidence(0.95/0.72)=${conf95}/${conf72} oversized@0.95=${oversized95}`)
  }
  if (!checkedAny) return
  console.log('  [real-sample match profile]\n' + rows.join('\n'))
})
