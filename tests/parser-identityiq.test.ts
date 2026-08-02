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

  // The label/value boundary moves with the detected columns. When it did not, every label word was
  // nearest to the first column and became that bureau's value: TransUnion alone stored
  // "Account #: 12340000****" and "Account Status: Open" while the other two stored the value only,
  // so every cross-bureau string comparison was comparing a label against a bare value.
  assert.equal(byBureau.get('transunion')?.maskedAccount, '12340000****')
  assert.equal(byBureau.get('transunion')?.status.normalized, 'Open')
  assert.deepEqual(
    [...byBureau.values()].map(line => line.status.normalized),
    ['Open', 'Open', 'Open'],
    'no bureau carries its own label as a value',
  )
})

test('identityiq-pdf: an account block continues across a page break but stops at the next section', () => {
  // IdentityIQ paginates mid-account: the remaining field rows resume at the top of the next page
  // with no repeated bureau header and no heading. Ending the block at the page edge cut it off
  // before its Balance row on 4 accounts across the authorized samples.
  const report = parseIdentityIqPdf([
    word(1, 130, 340, 210, 352, 'Page Break Bank'),
    word(1, 150, 360, 190, 372, 'Account'), word(1, 195, 360, 215, 372, '#:'),
    word(1, 225, 360, 270, 372, '33334444****'), word(1, 356, 360, 401, 372, '33334444****'), word(1, 488, 360, 533, 372, '33334444****'),
    word(1, 150, 374, 200, 386, 'Account'), word(1, 205, 374, 245, 386, 'Status:'),
    word(1, 225, 374, 260, 386, 'Open'), word(1, 356, 374, 391, 386, 'Open'), word(1, 488, 374, 523, 386, 'Open'),
    // …page 2 resumes the same account.
    word(2, 160, 40, 210, 52, 'Balance:'),
    word(2, 225, 40, 260, 52, '$300.00'), word(2, 356, 40, 391, 52, '$310.00'), word(2, 488, 40, 523, 52, '$300.00'),
    // The section heading ends the block; a Balance row beyond it belongs to something else.
    word(2, 210, 80, 260, 92, 'Inquiries'), word(2, 500, 80, 550, 92, 'Back'), word(2, 555, 80, 575, 92, 'to'), word(2, 580, 80, 600, 92, 'Top'),
    word(2, 160, 100, 210, 112, 'Balance:'),
    word(2, 225, 100, 260, 112, '$999.00'), word(2, 356, 100, 391, 112, '$999.00'), word(2, 488, 100, 523, 112, '$999.00'),
  ])
  const byBureau = new Map(report.tradelines.map(line => [line.bureau, line]))
  assert.equal(report.tradelines.length, 3)
  assert.equal(byBureau.get('transunion')?.balance.normalized, 30000, 'the balance row on the next page belongs to this account')
  assert.equal(byBureau.get('experian')?.balance.normalized, 31000)
  assert.equal(byBureau.get('transunion')?.status.normalized, 'Open')
  assert.notEqual(byBureau.get('transunion')?.balance.normalized, 99900, 'the block stops at the section heading')
})

test('identityiq-pdf: an account that reports no balance is kept with the balance unknown', () => {
  // A paid or closed account renders "-" for its balance. Dropping the tradeline hid it from every
  // other check too; the value is marked unknown instead, so balance rules suppress and say why.
  const report = parseIdentityIqPdf([
    word(1, 130, 340, 210, 352, 'Paid Off Bank'),
    word(1, 150, 360, 190, 372, 'Account'), word(1, 195, 360, 215, 372, '#:'),
    word(1, 225, 360, 270, 372, '77778888****'), word(1, 356, 360, 401, 372, '77778888****'), word(1, 488, 360, 533, 372, '77778888****'),
    word(1, 150, 374, 200, 386, 'Account'), word(1, 205, 374, 245, 386, 'Status:'),
    word(1, 225, 374, 260, 386, 'Paid'), word(1, 356, 374, 391, 386, 'Paid'), word(1, 488, 374, 523, 386, 'Paid'),
    word(1, 160, 388, 210, 400, 'Balance:'),
    word(1, 225, 388, 260, 400, '-'), word(1, 356, 388, 391, 400, '-'), word(1, 488, 388, 523, 400, '-'),
  ])
  assert.equal(report.tradelines.length, 3)
  for (const line of report.tradelines) {
    assert.equal(line.balance.normalized, null)
    assert.equal(line.balance.state, 'unknown', 'an absent balance is marked, never invented')
    assert.equal(line.status.normalized, 'Paid', 'the rest of the account is still extracted')
    assert.equal(line.maskedAccount, '77778888****')
  }
})

test('identityiq-pdf: an account only one bureau reports is still an account', () => {
  // This required two bureau columns, which discarded 9 of the 37 accounts across the authorized
  // samples — and an account a single bureau carries is the incomplete-reporting signal a reader
  // most wants surfaced, not the one to throw away.
  const report = parseIdentityIqPdf([
    word(1, 130, 340, 210, 352, 'Solo Bureau Bank'),
    word(1, 150, 360, 190, 372, 'Account'), word(1, 195, 360, 215, 372, '#:'),
    word(1, 225, 360, 270, 372, '12123434****'),
    word(1, 160, 374, 210, 386, 'Balance:'), word(1, 225, 374, 260, 386, '$50.00'),
  ])
  assert.equal(report.tradelines.length, 1)
  assert.equal(report.tradelines[0]?.bureau, 'transunion')
  assert.equal(report.tradelines[0]?.maskedAccount, '12123434****')
  assert.equal(report.tradelines[0]?.balance.normalized, 5000)
})

test('identityiq-pdf: the payment-history grid is read from its own Month and Year headers', () => {
  // The grid is a full-width table that does not use the bureau columns: a Month row, a Year row,
  // and one row per bureau, every cell sharing the header cells' x-centre. Each status cell is
  // therefore explicitly dated by the document. The adapter used to demand a per-token `YYYY-MM:`
  // prefix that this format never uses, so payment history came back empty on all four samples.
  const cell = (x: number, y: number, text: string) => word(1, x - 8, y, x + 8, y + 12, text)
  const report = parseIdentityIqPdf([
    word(1, 130, 100, 210, 112, 'Grid Bank'),
    word(1, 150, 120, 190, 132, 'Account'), word(1, 195, 120, 215, 132, '#:'),
    word(1, 225, 120, 270, 132, '55556666****'), word(1, 356, 120, 401, 132, '55556666****'), word(1, 488, 120, 533, 132, '55556666****'),
    word(1, 160, 134, 210, 146, 'Balance:'),
    word(1, 225, 134, 260, 146, '$10.00'), word(1, 356, 134, 391, 146, '$10.00'), word(1, 488, 134, 523, 146, '$10.00'),
    // One template appends a Legend link to the heading row; it must not stop the match.
    word(1, 60, 160, 140, 172, 'Two-Year payment history'), word(1, 520, 160, 560, 172, 'Legend'),
    word(1, 60, 176, 100, 188, 'Month'), cell(120, 176, 'Apr'), cell(140, 176, 'Mar'), cell(160, 176, 'Feb'), cell(180, 176, 'Jan'),
    word(1, 60, 192, 100, 204, 'Year'), cell(120, 192, '25'), cell(140, 192, '25'), cell(160, 192, '24'), cell(180, 192, '24'),
    word(1, 60, 208, 110, 220, 'TransUnion'), cell(120, 208, 'OK'), cell(140, 208, '30'), cell(160, 208, '60'), cell(180, 208, 'OK'),
    word(1, 60, 224, 105, 236, 'Experian'), cell(120, 224, 'OK'), cell(140, 224, 'OK'), cell(160, 224, 'OK'), cell(180, 224, 'OK'),
    // A partial bureau row, plus a cell sitting under no column at all.
    word(1, 60, 240, 100, 252, 'Equifax'), cell(140, 240, 'OK'), cell(160, 240, 'OK'), cell(300, 240, '90'),
  ])
  const byBureau = new Map(report.tradelines.map(line => [line.bureau, line]))
  const cells = (bureau: string) => (byBureau.get(bureau as never)?.paymentHistory ?? []).map(c => [c.yearMonth, c.normalized])

  // The year comes from the column the cell sits under, not from the row's first year.
  assert.deepEqual(cells('transunion'), [['2025-04', 'OK'], ['2025-03', '30'], ['2024-02', '60'], ['2024-01', 'OK']])
  assert.deepEqual(cells('experian'), [['2025-04', 'OK'], ['2025-03', 'OK'], ['2024-02', 'OK'], ['2024-01', 'OK']])
  assert.deepEqual(cells('equifax'), [['2025-03', 'OK'], ['2024-02', 'OK']], 'a cell under no stated month is dropped, never positioned')
  assert.match(byBureau.get('transunion')?.paymentHistory[1]?.source.locator ?? '', /paymentHistory:2025-03/)
})

test('identityiq-pdf: summary tallies and payment-grid headers are not accounts', () => {
  // Every one of these rows became a tradeline on the authorized samples — 28 of one report's 33.
  // A bare integer is not an amount: masked account numbers, term counts, the payment-history year
  // header, and the Summary section's own tallies are all bare integers rendered per bureau.
  const words = [
    word(1, 225, 100, 275, 112, 'TransUnion'), word(1, 356, 100, 406, 112, 'Experian'), word(1, 488, 100, 538, 112, 'Equifax'),
    word(1, 130, 130, 200, 142, 'Total'), word(1, 205, 130, 250, 142, 'Accounts:'),
    word(1, 260, 130, 280, 142, '12'), word(1, 380, 130, 400, 142, '9'), word(1, 510, 130, 530, 142, '9'),
    word(1, 130, 150, 200, 162, 'Balances:'),
    word(1, 260, 150, 300, 162, '$12,345.00'), word(1, 380, 150, 420, 162, '$12,300.00'), word(1, 510, 150, 550, 162, '$9,000.00'),
    word(1, 130, 170, 180, 182, 'Year'),
    word(1, 260, 170, 280, 182, '25'), word(1, 380, 170, 400, 182, '24'), word(1, 510, 170, 530, 182, '23'),
    word(1, 130, 190, 190, 202, 'Account'), word(1, 195, 190, 215, 202, '#:'),
    word(1, 260, 190, 320, 202, '111122223333'), word(1, 380, 190, 440, 202, '444455556666'), word(1, 510, 190, 570, 202, '777788889999'),
  ]
  const report = parseIdentityIqPdf(words)
  assert.deepEqual(report.tradelines, [], 'no structural or summary row may become an account')
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

/**
 * Personal Information reader.
 *
 * The fixture reproduces the layout quirks that actually appear in the authorized samples, because
 * each one broke a plausible-looking first implementation:
 *  - the label is vertically CENTERED against a multi-row value, so it is not the block's first row;
 *  - TransUnion values start left of where a naive left-edge cut would put the label boundary;
 *  - one bureau states the birth date as a bare year while another states the full date;
 *  - addresses wrap over three rows with no delimiter and a reported-on date between them.
 */
const personalFixture = (): Word[] => [
  word(1, 60, 100, 200, 112, 'Personal'), word(1, 205, 100, 300, 112, 'Information'),
  word(1, 215, 130, 268, 142, 'TransUnion'), word(1, 350, 130, 394, 142, 'Experian'), word(1, 484, 130, 524, 142, 'Equifax'),
  // Name: the label ends at x≈157 and TransUnion's first token starts at x≈215.
  word(1, 130, 150, 170, 162, 'Name:'),
  word(1, 215, 150, 250, 162, 'ALEXANDER'), word(1, 255, 150, 285, 162, 'RIVERA'),
  word(1, 340, 150, 372, 162, 'ALEXANDER'), word(1, 376, 150, 386, 162, 'J'), word(1, 390, 150, 425, 162, 'RIVERA'),
  word(1, 470, 150, 505, 162, 'MARCUS'), word(1, 510, 150, 550, 162, 'OKONKWO'),
  // Date of birth: Experian states only the year.
  word(1, 120, 170, 175, 182, 'Date of Birth:'),
  word(1, 225, 170, 258, 182, '1/9/1986'), word(1, 356, 170, 390, 182, '1986'), word(1, 488, 170, 520, 182, '1/9/1986'),
  // Current address block: label centred on the middle row; Experian leads a row of its own.
  word(1, 328, 200, 338, 212, '9'), word(1, 342, 200, 385, 212, 'HARTMAN'), word(1, 389, 200, 407, 212, 'RD'),
  word(1, 200, 214, 215, 226, '9'), word(1, 220, 214, 265, 226, 'HARTMAN'), word(1, 270, 214, 290, 226, 'RD'),
  word(1, 465, 214, 480, 226, '62'), word(1, 485, 214, 500, 226, 'N'), word(1, 505, 214, 540, 226, 'PINE'),
  word(1, 80, 228, 180, 240, 'Current Address(es):'),
  word(1, 220, 228, 250, 240, 'ALBANY,'), word(1, 255, 228, 275, 240, 'NY'),
  word(1, 350, 228, 382, 240, 'ALBANY,'), word(1, 386, 228, 402, 240, 'NY'),
  word(1, 480, 228, 515, 240, 'ALBANY,'), word(1, 520, 228, 540, 240, 'NY'),
  word(1, 228, 242, 258, 254, '12208'), word(1, 356, 242, 395, 254, '12208-1088'), word(1, 490, 242, 520, 254, '12203'),
  // A reported-on date sits between two addresses and must not prefix the next one.
  word(1, 356, 256, 390, 268, '09/2025'),
  word(1, 200, 270, 230, 282, '5221'), word(1, 235, 270, 285, 282, 'FLATLANDS'),
  word(1, 80, 284, 180, 296, 'Previous Address(es):'),
  word(1, 220, 284, 265, 296, 'BROOKLYN,'), word(1, 270, 284, 290, 296, 'NY'),
  word(1, 228, 298, 258, 310, '11234'),
  word(1, 100, 320, 180, 332, 'Employers:'),
  word(1, 200, 320, 265, 332, 'MONSTAAR FITNESS'),
  word(1, 470, 340, 520, 352, 'Back'), word(1, 525, 340, 545, 352, 'to'), word(1, 550, 340, 565, 352, 'Top'),
]

test('identityiq-pdf: personal information reads names, dates of birth, addresses, and employers per bureau', () => {
  const { personalInformation } = parseIdentityIqPdf(personalFixture())

  const nameByBureau = new Map(personalInformation.names.map(value => [value.bureau, value.normalized]))
  assert.equal(nameByBureau.get('transunion'), 'ALEXANDER RIVERA')
  assert.equal(nameByBureau.get('experian'), 'ALEXANDER J RIVERA')
  assert.equal(nameByBureau.get('equifax'), 'MARCUS OKONKWO', 'a divergent bureau name is kept, not normalized away')

  // Each bureau's stated precision is preserved. Padding the year-only value to a full date would
  // invent a month and day the document never claimed.
  const dobByBureau = new Map(personalInformation.datesOfBirth.map(value => [value.bureau, value.normalized]))
  assert.equal(dobByBureau.get('transunion'), '1986-01-09')
  assert.equal(dobByBureau.get('experian'), '1986')
  assert.equal(dobByBureau.get('equifax'), '1986-01-09')

  // The label sits on the block's middle row, so the rows above it belong to this field too.
  const currentByBureau = new Map(personalInformation.currentAddresses.map(value => [value.bureau, value.normalized]))
  assert.equal(currentByBureau.get('transunion'), '9 HARTMAN RD ALBANY, NY 12208')
  assert.equal(currentByBureau.get('experian'), '9 HARTMAN RD ALBANY, NY 12208-1088')
  assert.equal(currentByBureau.get('equifax'), '62 N PINE ALBANY, NY 12203')

  // Ordering, not the label position, decides current vs previous: the "Previous Address(es)"
  // label is centred and so sits below rows that already belong to it.
  const previous = personalInformation.previousAddresses.filter(value => value.bureau === 'transunion')
  assert.equal(previous.length, 1)
  assert.equal(previous[0]?.normalized, '5221 FLATLANDS BROOKLYN, NY 11234', 'the interleaved reported-on date is dropped, not prefixed')

  assert.equal(personalInformation.employers.find(value => value.bureau === 'transunion')?.normalized, 'MONSTAAR FITNESS')
  assert.ok(personalInformation.names.every(value => value.source.locator.startsWith('pdf:')), 'every personal value keeps a source reference')
})

test('identityiq-pdf: personal information emits nothing rather than guessing when the section is absent or empty', () => {
  assert.deepEqual(parseIdentityIqPdf(fixture()).personalInformation.names, [], 'no Personal Information section means no identity values')

  // A dash is how these reports render "nothing on file" — an absence, not a value to publish.
  const dashes = parseIdentityIqPdf([
    word(1, 60, 100, 200, 112, 'Personal'), word(1, 205, 100, 300, 112, 'Information'),
    word(1, 215, 130, 268, 142, 'TransUnion'), word(1, 350, 130, 394, 142, 'Experian'), word(1, 484, 130, 524, 142, 'Equifax'),
    word(1, 108, 150, 160, 162, 'Also Known As:'),
    word(1, 228, 150, 250, 162, '-'), word(1, 356, 150, 380, 162, '-'), word(1, 488, 150, 510, 162, '-'),
    word(1, 470, 200, 520, 212, 'Back'), word(1, 525, 200, 545, 212, 'to'), word(1, 550, 200, 565, 212, 'Top'),
  ])
  assert.deepEqual(dashes.personalInformation.alsoKnownAs, [])
})
