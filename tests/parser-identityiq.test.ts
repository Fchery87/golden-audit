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
  const example = report.tradelines.filter(t => t.creditor === 'Example Bank') as ParserTradeline[]
  assert.equal(example.length, 3)
  const byBureau = new Map(example.map(t => [t.bureau, t]))
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

test('identityiq-pdf: end-to-end → deterministic core flags the differing bureau, not the agreeing one', () => {
  const report = parseIdentityIqPdf(fixture())
  const run = (creditor: string) => {
    const tl = report.tradelines.filter(t => t.creditor === creditor).map(t => ({ ...t, bureau: t.bureau })) as unknown as EvaluableTradeline[]
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
  const byBureau = new Map(report.tradelines.filter(t => t.creditor === 'Test Creditor').map(t => [t.bureau, t]))
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
    const ok = report.tradelines.length > 0 && bureaus.has('transunion') && bureaus.has('experian') && bureaus.has('equifax')
    if (!ok) failed.push(`${p.split('/').pop()} (tradelines=${report.tradelines.length}, bureaus=[${[...bureaus].join(',')}])`)
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
