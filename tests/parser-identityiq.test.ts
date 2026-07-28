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
  // account 1 — Example Bank, balances differ across bureaus
  word(1, 130, 380, 200, 392, 'Example Bank'),
  word(1, 225, 380, 260, 392, '$125.00'),  // TU
  word(1, 356, 380, 390, 392, '$150.00'),  // EX
  word(1, 488, 380, 520, 392, '$125.00'),  // EQ
  // account 2 — Acme Card, balances agree
  word(1, 130, 410, 200, 422, 'Acme Card Co'),
  word(1, 225, 410, 260, 422, '$200.00'),
  word(1, 356, 410, 390, 422, '$200.00'),
  word(1, 488, 410, 520, 422, '$200.00'),
]

const balanceRule = (overrides: Partial<EvaluableRule> = {}): EvaluableRule => ({
  id: 'r', name: 'cross-bureau-balance-difference', status: 'published', minimumConfidence: 0.9,
  classification: 'verification-recommended', limitations: ['different update dates can explain a difference'],
  authorityIds: [], educationModuleIds: [], ...overrides,
})

test('identityiq-pdf: groups tri-bureau columns into per-bureau tradelines with correct balances', () => {
  const report = parseIdentityIqPdf(fixture())
  assert.equal(report.tradelines.length, 6)
  const example = report.tradelines.filter(t => t.creditor === 'Example Bank') as ParserTradeline[]
  assert.equal(example.length, 3)
  const byBureau = new Map(example.map(t => [t.bureau, t]))
  assert.equal(byBureau.get('transunion')?.balance.normalized, 12500)
  assert.equal(byBureau.get('experian')?.balance.normalized, 15000)
  assert.equal(byBureau.get('equifax')?.balance.normalized, 12500)
  assert.match(byBureau.get('transunion')?.balance.source.locator ?? '', /pdf:p1:y380:transunion:balance/)
})

test('identityiq-pdf: end-to-end → deterministic core flags the differing bureau, not the agreeing one', () => {
  const report = parseIdentityIqPdf(fixture())
  const run = (creditor: string) => {
    const tl = report.tradelines.filter(t => t.creditor === creditor) as unknown as EvaluableTradeline[]
    return evaluateAnalysis({
      rules: [balanceRule()], tradelines: tl,
      confirmedMatches: [{ tradelineIds: tl.map(t => t.id) }],
      versions: { normalizedInput: 1, ruleset: 'rs', jurisdiction: 'US-CA', parser: 'identityiq-pdf-v1', application: 'test' },
    })
  }
  assert.equal(run('Example Bank').findings.length, 1) // TU≠EX → finding
  assert.equal(run('Acme Card Co').findings.length, 0) // all equal → skipped, no finding
})

test('identityiq-pdf: inbound redaction strips identifier-bearing words before analysis', () => {
  const withSsn = [...fixture(), word(1, 130, 440, 200, 452, 'SSN 123-45-6789')]
  const report = parseIdentityIqPdf(withSsn)
  const serialized = JSON.stringify(report)
  assert.ok(!serialized.includes('123-45-6789'), 'raw SSN must not reach the parsed report')
  // redactWords itself replaces identifier tokens
  assert.ok(redactWords([word(1, 0, 0, 10, 10, '123-45-6789')])[0]?.text === '[REDACTED]')
})

// Local-only smoke test on the REAL IdentityIQ PDF: structure assertions only, skipped
// if the file or poppler is absent (so it never fails in CI / for other contributors).
test('identityiq-pdf: real-file smoke (structure only, skipped if unavailable)', { skip: !(existsSync('docs/reports/Credit Report - IdentityIQ.pdf') && which('pdftotext')) }, () => {
  const html = execSync('pdftotext -bbox "docs/reports/Credit Report - IdentityIQ.pdf" -', { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 })
  const report = parseIdentityIqPdfBbox(html)
  const bureaus = new Set(report.tradelines.map(t => t.bureau))
  assert.ok(report.tradelines.length > 0, 'expected the real report to yield tradelines')
  assert.ok(bureaus.has('transunion') && bureaus.has('experian') && bureaus.has('equifax'), `expected all 3 bureaus; got ${[...bureaus].join(',')}`)
  // assert NOTHING about values — structure only.
})

function which(bin: string): boolean {
  try { execSync(`command -v ${bin}`, { stdio: 'ignore' }); return true } catch { return false }
}
