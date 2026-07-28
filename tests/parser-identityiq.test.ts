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

test('identityiq-pdf: dynamic column detection — maps non-standard (2023-style) columns to correct bureaus', () => {
  // Bureau header row at the 2023 template's column x-centers (308/485/650), NOT the
  // legacy 241/372/504. With fixed bands this would mis-map EX→EQ; dynamic detection must fix it.
  const dynamicFixture: Word[] = [
    word(1, 288, 100, 328, 112, 'TRANSUNION'), word(1, 465, 100, 505, 112, 'EXPERIAN'), word(1, 630, 100, 670, 112, 'EQUIFAX'),
    word(1, 130, 380, 200, 392, 'Test Creditor'),
    word(1, 288, 380, 328, 392, '$111.00'),  // xc≈308 → TU
    word(1, 465, 380, 505, 392, '$222.00'),  // xc≈485 → EX
    word(1, 630, 380, 670, 392, '$333.00'),  // xc≈650 → EQ
  ]
  const report = parseIdentityIqPdf(dynamicFixture)
  const byBureau = new Map(report.tradelines.filter(t => t.creditor === 'Test Creditor').map(t => [t.bureau, t]))
  assert.equal(byBureau.get('transunion')?.balance.normalized, 11100, 'TU column at x308 must map to transunion')
  assert.equal(byBureau.get('experian')?.balance.normalized, 22200, 'EX column at x485 must map to experian (fixed bands would mis-map this to equifax)')
  assert.equal(byBureau.get('equifax')?.balance.normalized, 33300, 'EQ column at x650 must map to equifax')
})

// Local-only smoke test on ALL real IdentityIQ PDFs (the cross-template overfitting guard):
// structure assertions only, skipped if files or poppler are absent.
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
    // assert NOTHING about values — structure only.
  }
  if (missing.length === REAL_PDFS.length) { /* all absent -> skip silently via no-assertion? still must pass */ }
  assert.equal(failed.length, 0, `overfitting guard: samples that failed to yield all 3 bureaus: ${failed.join('; ') || '(none)'}`)
})

function which(bin: string): boolean {
  try { execSync(`command -v ${bin}`, { stdio: 'ignore' }); return true } catch { return false }
}
