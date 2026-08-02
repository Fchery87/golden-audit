import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { execSync } from 'node:child_process'
import {
  parseIdentityIqPdf, parseIdentityIqPdfBbox, redactWords,
  type Word, type ParserTradeline,
} from '../packages/parser/src/index.js'
import { evaluateAnalysis, type EvaluableRule, type EvaluableTradeline } from '../packages/analysis-core/src/index.js'

const word = (page: number, x1: number, y1: number, x2: number, y2: number, text: string): Word =>
  ({ page, xMin: x1, yMin: y1, xMax: x2, yMax: y2, text })

// Synthetic positional fixture in the REAL IdentityIQ column layout (fictitious values).
// Columns derived empirically: creditor x≈165; TU≈242, EX≈373, EQ≈504.
const fixture = (): Word[] => [
  word(1, 130, 340, 210, 352, 'Example Bank'),
  word(1, 150, 360, 190, 372, 'Account'),
  word(1, 195, 360, 215, 372, '#:'),
  word(1, 225, 360, 270, 372, '11112222****'),
  word(1, 356, 360, 401, 372, '11112222****'),
  word(1, 488, 360, 533, 372, '11112222****'),
  word(1, 150, 374, 200, 386, 'Account'),
  word(1, 205, 374, 245, 386, 'Type:'),
  word(1, 225, 374, 275, 386, 'Revolving'),
  word(1, 356, 374, 406, 386, 'Revolving'),
  word(1, 488, 374, 538, 386, 'Revolving'),
  word(1, 150, 388, 200, 400, 'Account'),
  word(1, 205, 388, 245, 400, 'Status:'),
  word(1, 225, 388, 260, 400, 'Open'),
  word(1, 356, 388, 391, 400, 'Open'),
  word(1, 488, 388, 523, 400, 'Open'),
  word(1, 150, 402, 190, 414, 'Date'),
  word(1, 195, 402, 245, 414, 'Opened:'),
  word(1, 225, 402, 280, 414, '2020-01'),
  word(1, 356, 402, 411, 414, '2020-01'),
  word(1, 488, 402, 543, 414, '2020-01'),
  word(1, 160, 416, 210, 428, 'Balance:'),
  word(1, 225, 416, 260, 428, '$125.00'),
  word(1, 356, 416, 391, 428, '$150.00'),
  word(1, 488, 416, 523, 428, '$125.00'),
  word(1, 160, 430, 210, 442, 'Credit'),
  word(1, 215, 430, 250, 442, 'Limit:'),
  word(1, 225, 430, 280, 442, '$1,000.00'),
  word(1, 356, 430, 411, 442, '$1,250.00'),
  word(1, 488, 430, 543, 442, '$1,000.00'),
  word(1, 170, 444, 210, 456, 'Past'),
  word(1, 215, 444, 250, 456, 'Due:'),
  word(1, 225, 444, 280, 456, '$0.00'),
  word(1, 356, 444, 411, 456, '$25.00'),
  word(1, 488, 444, 543, 456, '$0.00'),
  word(1, 145, 458, 190, 470, 'Last'),
  word(1, 195, 458, 255, 470, 'Reported:'),
  word(1, 225, 458, 280, 470, '2026-06-30'),
  word(1, 356, 458, 411, 470, '2026-06-28'),
  word(1, 488, 458, 543, 470, '2026-06-29'),

  word(1, 130, 450, 210, 462, 'Acme Card Co'),
  word(1, 150, 470, 190, 482, 'Account'),
  word(1, 195, 470, 215, 482, '#:'),
  word(1, 225, 470, 270, 482, '99990000****'),
  word(1, 356, 470, 401, 482, '99990000****'),
  word(1, 488, 470, 533, 482, '99990000****'),
  word(1, 150, 484, 200, 496, 'Account'),
  word(1, 205, 484, 245, 496, 'Status:'),
  word(1, 225, 484, 260, 496, 'Open'),
  word(1, 356, 484, 391, 496, 'Open'),
  word(1, 488, 484, 523, 496, 'Open'),
  word(1, 150, 498, 190, 510, 'Date'),
  word(1, 195, 498, 245, 510, 'Opened:'),
  word(1, 225, 498, 280, 510, '2019-05'),
  word(1, 356, 498, 411, 510, '2019-05'),
  word(1, 488, 498, 543, 510, '2019-05'),
  word(1, 160, 512, 210, 524, 'Balance:'),
  word(1, 225, 512, 260, 524, '$200.00'),
  word(1, 356, 512, 391, 524, '$200.00'),
  word(1, 488, 512, 523, 524, '$200.00'),
  word(1, 145, 526, 190, 538, 'Last'),
  word(1, 195, 526, 255, 538, 'Reported:'),
  word(1, 225, 526, 280, 538, '2026-06-30'),
  word(1, 356, 526, 411, 538, '2026-06-30'),
  word(1, 488, 526, 543, 538, '2026-06-30'),
]

const balanceRule = (overrides: Partial<EvaluableRule> = {}): EvaluableRule => ({
  id: 'r', name: 'cross-bureau-balance-difference', status: 'published', minimumConfidence: 0.9,
  classification: 'verification-recommended', limitations: ['different update dates can explain a difference'],
  authorityIds: [], educationModuleIds: [], ...overrides,
})

test('identityiq-pdf: reconstructs account blocks with masked account, status, opened, updated, and balance', () => {
  const report = parseIdentityIqPdf(fixture())
  assert.equal(report.tradelines.length, 6)
  assert.equal(report.scores.length, 0)
  assert.equal(report.inquiries.length, 0)
  const example = report.tradelines.filter(t => t.creditor.normalized === 'Example Bank') as ParserTradeline[]
  assert.equal(example.length, 3)
  const byBureau = new Map(example.map(t => [t.bureau, t]))
  assert.equal(byBureau.get('transunion')?.creditor.normalized, 'Example Bank')
  assert.match(byBureau.get('transunion')?.creditor.source.locator ?? '', /pdf:p1:y340:transunion:creditor/)
  assert.equal(byBureau.get('transunion')?.maskedAccount, '11112222****')
  assert.equal(byBureau.get('transunion')?.accountType.normalized, 'Revolving')
  assert.equal(byBureau.get('transunion')?.status.normalized, 'Open')
  assert.equal(byBureau.get('transunion')?.opened.normalized, '2020-01')
  assert.equal(byBureau.get('transunion')?.updated.normalized, '2026-06-30')
  assert.equal(byBureau.get('transunion')?.balance.normalized, 12500)
  assert.equal(byBureau.get('transunion')?.creditLimit.normalized, 100000)
  assert.equal(byBureau.get('experian')?.creditLimit.normalized, 125000)
  assert.equal(byBureau.get('experian')?.pastDue.normalized, 2500)
  assert.equal(byBureau.get('experian')?.balance.normalized, 15000)
  assert.equal(byBureau.get('equifax')?.balance.normalized, 12500)
  assert.match(byBureau.get('transunion')?.balance.source.locator ?? '', /pdf:p1:y360:transunion:balance/)
})

test('identityiq-pdf: extracts source-linked reported scores and inquiries only from complete labeled layouts', () => {
  const report = parseIdentityIqPdf([
    word(1, 210, 100, 260, 112, 'Credit'), word(1, 265, 100, 315, 112, 'Score'), word(1, 500, 100, 550, 112, 'Back'), word(1, 555, 100, 575, 112, 'to'), word(1, 580, 100, 600, 112, 'Top'),
    word(1, 225, 120, 275, 132, 'TransUnion'), word(1, 356, 120, 406, 132, 'Experian'), word(1, 488, 120, 538, 132, 'Equifax'),
    word(1, 140, 134, 205, 146, 'Credit'), word(1, 210, 134, 250, 146, 'Score:'), word(1, 225, 134, 250, 146, '614'), word(1, 356, 134, 381, 146, '622'), word(1, 488, 134, 513, 146, '617'),
    word(1, 140, 148, 195, 160, 'Score'), word(1, 200, 148, 240, 160, 'Scale:'), word(1, 225, 148, 280, 160, '300-850'), word(1, 356, 148, 411, 160, '300-850'), word(1, 488, 148, 543, 160, '300-850'),
    word(2, 210, 100, 270, 112, 'Inquiries'), word(2, 500, 100, 550, 112, 'Back'), word(2, 555, 100, 575, 112, 'to'), word(2, 580, 100, 600, 112, 'Top'),
    word(2, 45, 120, 100, 132, 'Creditor'), word(2, 105, 120, 140, 132, 'Name'), word(2, 250, 120, 285, 132, 'Type'), word(2, 290, 120, 350, 132, 'of'), word(2, 355, 120, 420, 132, 'Business'), word(2, 500, 120, 535, 132, 'Date'), word(2, 540, 120, 555, 132, 'of'), word(2, 560, 120, 610, 132, 'inquiry'), word(2, 650, 120, 690, 132, 'Credit'), word(2, 695, 120, 745, 132, 'Bureau'),
    word(2, 45, 140, 150, 152, 'Example Lender'), word(2, 250, 140, 390, 152, 'Mortgage Reporters'), word(2, 500, 140, 570, 152, '03/24/2020'), word(2, 650, 140, 720, 152, 'Experian'),
    word(2, 45, 154, 150, 166, 'Missing Date'), word(2, 250, 154, 390, 166, 'Finance'), word(2, 650, 154, 720, 166, 'Equifax'),
    word(2, 45, 168, 150, 180, 'Invalid Date'), word(2, 250, 168, 390, 180, 'Finance'), word(2, 500, 168, 570, 180, '02/31/2025'), word(2, 650, 168, 720, 180, 'Equifax'),
    word(2, 45, 182, 150, 194, 'TransUnion'), word(2, 250, 182, 390, 194, 'Finance'), word(2, 500, 182, 570, 194, '03/24/2020'), word(2, 650, 182, 720, 194, 'Experian'),
  ])
  assert.deepEqual(report.scores.map(score => [score.bureau, score.score.normalized]), [['transunion', 614], ['experian', 622], ['equifax', 617]])
  assert.match(report.scores[0]?.score.source.locator ?? '', /pdf:p1:y134:transunion:score/)
  assert.equal(report.inquiries.length, 2)
  assert.deepEqual(report.inquiries[1] && [report.inquiries[1].creditor.normalized, report.inquiries[1].bureau], ['TransUnion', 'experian'])
  assert.deepEqual(report.inquiries[0] && [report.inquiries[0].creditor.normalized, report.inquiries[0].businessType.normalized, report.inquiries[0].date.normalized, report.inquiries[0].bureau], ['Example Lender', 'Mortgage Reporters', '2020-03-24', 'experian'])
  assert.match(report.inquiries[0]?.date.source.locator ?? '', /pdf:p2:y140:experian:inquiryDate/)

  const duplicateScore = parseIdentityIqPdf([
    word(1, 210, 100, 260, 112, 'Credit'), word(1, 265, 100, 315, 112, 'Score'), word(1, 500, 100, 550, 112, 'Back'), word(1, 555, 100, 575, 112, 'to'), word(1, 580, 100, 600, 112, 'Top'),
    word(1, 225, 120, 275, 132, 'TransUnion'), word(1, 356, 120, 406, 132, 'Experian'), word(1, 488, 120, 538, 132, 'Equifax'),
    word(1, 140, 134, 205, 146, 'Credit'), word(1, 210, 134, 250, 146, 'Score:'), word(1, 225, 134, 250, 146, '614'), word(1, 252, 134, 277, 146, '615'), word(1, 356, 134, 381, 146, '622'), word(1, 488, 134, 513, 146, '617'),
    word(1, 140, 148, 195, 160, 'Score'), word(1, 200, 148, 240, 160, 'Scale:'), word(1, 225, 148, 280, 160, '300-850'), word(1, 356, 148, 411, 160, '300-850'), word(1, 488, 148, 543, 160, '300-850'),
  ])
  assert.deepEqual(duplicateScore.scores.map(score => score.bureau), ['experian', 'equifax'])
})

test('identityiq-pdf: does not turn a Last Reported structural label into a fallback tradeline', () => {
  const words = [
    word(1, 150, 100, 190, 112, 'Last'), word(1, 195, 100, 255, 112, 'Reported:'),
    word(1, 225, 100, 280, 112, '2026-06-30'), word(1, 356, 100, 411, 112, '2026-06-29'), word(1, 488, 100, 543, 112, '2026-06-28'),
    word(1, 130, 130, 210, 142, 'Fallback Bank'),
    word(1, 225, 130, 280, 142, '$125.00'), word(1, 356, 130, 411, 142, '$150.00'),
  ]
  const report = parseIdentityIqPdf(words)
  assert.equal(report.tradelines.length, 2)
  assert.deepEqual(report.tradelines.map(line => line.creditor.normalized), ['Fallback Bank', 'Fallback Bank'])
  assert.deepEqual(report.tradelines.map(line => line.balance.normalized), [12500, 15000])
})

test('identityiq-pdf: preserves explicitly dated payment cells and account-level Slice 2 values with provenance', () => {
  const report = parseIdentityIqPdf([
    word(1, 130, 100, 210, 112, 'Slice Two Bank'),
    word(1, 150, 120, 190, 132, 'Account'), word(1, 195, 120, 215, 132, '#:'),
    word(1, 225, 120, 270, 132, '44445555****'), word(1, 356, 120, 401, 132, '44445555****'), word(1, 488, 120, 533, 132, '44445555****'),
    word(1, 160, 134, 210, 146, 'Balance:'),
    word(1, 225, 134, 260, 146, '$100.00'), word(1, 356, 134, 391, 146, '$100.00'), word(1, 488, 134, 523, 146, '$100.00'),
    word(1, 130, 148, 220, 160, 'Date of First Delinquency:'),
    word(1, 225, 148, 280, 160, '2021-02'), word(1, 356, 148, 411, 160, '2021-03'), word(1, 488, 148, 543, 160, '2021-02'),
    word(1, 160, 162, 220, 174, 'Payment History:'),
    word(1, 225, 162, 310, 174, '2026-01:C 2025-12:30'), word(1, 356, 162, 441, 174, '2026-01:C 2025-12:C'), word(1, 488, 162, 573, 174, '2026-01:C 2025-12:C'),
    word(1, 160, 175, 220, 187, 'Payment History:'),
    word(1, 225, 175, 310, 187, '2025-11:60'), word(1, 356, 175, 441, 187, '2025-11:C'), word(1, 488, 175, 573, 187, '2025-11:C'),
    word(1, 160, 188, 220, 200, 'Remarks:'),
    word(1, 225, 188, 330, 200, 'Consumer disputes this account'), word(1, 356, 188, 461, 200, 'Consumer disputes this account'), word(1, 488, 188, 593, 200, 'Consumer disputes this account'),
    word(1, 160, 202, 270, 214, 'Special Comment Code:'),
    word(1, 225, 202, 280, 214, 'AW'), word(1, 356, 202, 411, 214, 'AW'), word(1, 488, 202, 543, 214, 'AW'),
  ])
  const transunion = report.tradelines.find(line => line.bureau === 'transunion')
  assert.equal(transunion?.dateOfFirstDelinquency.normalized, '2021-02')
  assert.deepEqual(transunion?.paymentHistory.map(cell => [cell.yearMonth, cell.normalized]), [['2026-01', 'C'], ['2025-12', '30'], ['2025-11', '60']])
  assert.equal(transunion?.remarks[0]?.normalized, 'Consumer disputes this account')
  assert.equal(transunion?.specialCommentCodes[0]?.normalized, 'AW')
  assert.match(transunion?.paymentHistory[0]?.source.locator ?? '', /paymentHistory:2026-01/)
})
test('identityiq-pdf: keeps creditor vocabulary intact and does not inherit a missing next creditor', () => {
  const words = [
    word(1, 130, 100, 240, 112, 'Credit One Bank'),
    word(1, 150, 120, 190, 132, 'Account'), word(1, 195, 120, 215, 132, '#:'),
    word(1, 225, 120, 270, 132, '44445555****'), word(1, 356, 120, 401, 132, '44445555****'),
    word(1, 160, 134, 210, 146, 'Balance:'), word(1, 225, 134, 260, 146, '$100.00'), word(1, 356, 134, 391, 146, '$100.00'),
    word(1, 150, 148, 190, 160, 'Account'), word(1, 195, 148, 215, 160, '#:'),
    word(1, 225, 148, 270, 160, '99990000****'), word(1, 356, 148, 401, 160, '99990000****'),
    word(1, 160, 162, 210, 174, 'Balance:'), word(1, 225, 162, 260, 174, '$200.00'), word(1, 356, 162, 391, 174, '$200.00'),
  ]
  const report = parseIdentityIqPdf(words)
  assert.equal(report.tradelines.filter(line => line.creditor.normalized === 'Credit One Bank').length, 2)
  assert.equal(report.tradelines.filter(line => line.maskedAccount === '99990000****').length, 0)
})

test('identityiq-pdf: end-to-end → deterministic core flags the differing bureau, not the agreeing one', () => {
  const report = parseIdentityIqPdf(fixture())
  const run = (creditor: string) => {
    const tl = report.tradelines.filter(t => t.creditor.normalized === creditor).map(t => ({ ...t, bureau: t.bureau })) as unknown as EvaluableTradeline[]
    return evaluateAnalysis({
      rules: [balanceRule()], tradelines: tl,
      confirmedMatches: [{ tradelineIds: tl.map(t => t.id) }],
      versions: { normalizedInput: 1, ruleset: 'rs', jurisdiction: 'US-CA', parser: 'identityiq-pdf-v1', application: 'test' },
    })
  }
  assert.equal(run('Example Bank').findings.length, 1)
  assert.equal(run('Acme Card Co').findings.length, 0)
})

test('identityiq-pdf: inbound redaction strips identifier-bearing words before analysis', () => {
  const withSsn = [...fixture(), word(1, 130, 560, 200, 572, 'SSN 123-45-6789')]
  const report = parseIdentityIqPdf(withSsn)
  const serialized = JSON.stringify(report)
  assert.ok(!serialized.includes('123-45-6789'), 'raw SSN must not reach the parsed report')
  assert.ok(redactWords([word(1, 0, 0, 10, 10, '123-45-6789')])[0]?.text === '[REDACTED]')
})

test('identityiq-pdf: dynamic column detection — maps non-standard (2023-style) columns to correct bureaus', () => {
  const dynamicFixture: Word[] = [
    word(1, 288, 100, 328, 112, 'TRANSUNION'), word(1, 465, 100, 505, 112, 'EXPERIAN'), word(1, 630, 100, 670, 112, 'EQUIFAX'),
    word(1, 130, 340, 200, 352, 'Test Creditor'),
    word(1, 150, 360, 190, 372, 'Account'), word(1, 195, 360, 215, 372, '#:'),
    word(1, 288, 360, 328, 372, '12340000****'), word(1, 465, 360, 505, 372, '12340000****'), word(1, 630, 360, 670, 372, '12340000****'),
    word(1, 150, 374, 200, 386, 'Account'), word(1, 205, 374, 245, 386, 'Status:'),
    word(1, 288, 374, 328, 386, 'Open'), word(1, 465, 374, 505, 386, 'Open'), word(1, 630, 374, 670, 386, 'Open'),
    word(1, 160, 388, 210, 400, 'Balance:'),
    word(1, 288, 388, 328, 400, '$111.00'),
    word(1, 465, 388, 505, 400, '$222.00'),
    word(1, 630, 388, 670, 400, '$333.00'),
  ]
  const report = parseIdentityIqPdf(dynamicFixture)
  const byBureau = new Map(report.tradelines.filter(t => t.creditor.normalized === 'Test Creditor').map(t => [t.bureau, t]))
  assert.equal(byBureau.get('transunion')?.balance.normalized, 11100)
  assert.equal(byBureau.get('experian')?.balance.normalized, 22200)
  assert.equal(byBureau.get('equifax')?.balance.normalized, 33300)
})

const REAL_PDFS = [
  'docs/reports/Credit Report - IdentityIQ.pdf',
  'docs/reports/Credit Report - IdentityIQ (copy).pdf',
  'docs/reports/Credit Report - IdentityIQ (another copy).pdf',
  'docs/reports/C_Pique_Credit Report - IdentityIQ.pdf',
]
test('identityiq-pdf: real-file smoke across all samples (structure only; overfitting guard)', { skip: !which('pdftotext') }, () => {
  const missing: string[] = []
  const failed: string[] = []
  for (const p of REAL_PDFS) {
    if (!existsSync(p)) { missing.push(p); continue }
    const html = execSync(`pdftotext -bbox "${p}" -`, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 })
    const report = parseIdentityIqPdfBbox(html)
    const bureaus = new Set(report.tradelines.map(t => t.bureau))
    const scoreBureaus = new Set(report.scores.map(score => score.bureau))
    const invalidScore = report.scores.some(score => score.score.normalized === null || !score.score.source.locator || score.score.normalized < 300 || score.score.normalized > 850)
    const invalidInquiry = report.inquiries.some(inquiry => !inquiry.creditor.source.locator || !inquiry.date.source.locator || inquiry.date.normalized === null)
    const ok = report.tradelines.length > 0 && bureaus.has('transunion') && bureaus.has('experian') && bureaus.has('equifax') && scoreBureaus.size === 3 && !invalidScore && !invalidInquiry
    if (!ok) failed.push(`${p.split('/').pop()} (tradelines=${report.tradelines.length}, scores=${report.scores.length}, inquiries=${report.inquiries.length}, bureaus=[${[...bureaus].join(',')}])`)
  }
  if (missing.length === REAL_PDFS.length) { }
  assert.equal(failed.length, 0, `overfitting guard: samples that failed to yield all 3 bureaus: ${failed.join('; ') || '(none)'}`)
})

test('identityiq-pdf: whole-dollar balances normalize to minor units (x100), matching decimal format', () => {
  const report = parseIdentityIqPdf([
    word(1, 130, 340, 200, 352, 'Whole Dollar Bank'),
    word(1, 150, 360, 190, 372, 'Account'), word(1, 195, 360, 215, 372, '#:'),
    word(1, 225, 360, 260, 372, '55551234****'), word(1, 356, 360, 390, 372, '55551234****'), word(1, 488, 360, 520, 372, '55551234****'),
    word(1, 160, 388, 210, 400, 'Balance:'),
    word(1, 225, 388, 260, 400, '$1200'),
    word(1, 356, 388, 390, 400, '$1200.00'),
    word(1, 488, 388, 520, 400, '$1200'),
  ])
  const byBureau = new Map(report.tradelines.map(t => [t.bureau, t]))
  assert.equal(byBureau.get('transunion')?.balance.normalized, 120000)
  assert.equal(byBureau.get('experian')?.balance.normalized, 120000)
  assert.equal(byBureau.get('equifax')?.balance.normalized, 120000)
})

function which(bin: string): boolean {
  try { execSync(`command -v ${bin}`, { stdio: 'ignore' }); return true } catch { return false }
}
