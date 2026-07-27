import test from 'node:test'
import assert from 'node:assert/strict'
import { parseReportContent, detectFormat, type ParserReport, type ParserTradeline } from '../packages/parser/src/index.js'
import { evaluateAnalysis, type EvaluableRule, type EvaluableTradeline } from '../packages/analysis-core/src/index.js'
import { containsUnredactedIdentifier } from '../packages/redaction/src/index.js'

// FICTITIOUS educational fixture — not a real report, contains no real PII.
const fictitiousHtml = `<html><head><meta name="report-date" content="2026-07-01"></head><body>
<section data-cp="tradelines"><h2>Accounts</h2><table><tbody>
<tr data-bureau="equifax"><td>Example Bank</td><td>****5678</td><td>$125.00</td><td>Open</td><td>2020-01</td><td>2026-06-30</td></tr>
<tr data-bureau="experian"><td>Example Bank</td><td>****5678</td><td>$150.00</td><td>Open</td><td>2020-01</td><td>2026-06-28</td></tr>
</tbody></table></section></body></html>`

const balanceRule = (overrides: Partial<EvaluableRule> = {}): EvaluableRule => ({
  id: 'r1', name: 'cross-bureau-balance-difference', status: 'published', minimumConfidence: 0.9,
  classification: 'verification-recommended', limitations: ['different update dates can explain a difference'],
  authorityIds: [], educationModuleIds: [], ...overrides,
})

test('parser: detector rejects unknown layouts rather than guessing', () => {
  assert.deepEqual(detectFormat('%PDF-1.4 some real bureau pdf we have no adapter for'), { unsupported: true, reason: 'No supported provider/template signature found; rejecting rather than guessing' })
  assert.equal(detectFormat(fictitiousHtml), 'structured-html')
  assert.equal(detectFormat('<html>GOLDEN-AUDIT-REPORT:{}'), 'synthetic-fixture')
})

test('parser: unknown content surfaces an unsupported result, never a fabricated report', () => {
  const result = parseReportContent('%PDF-1.4 unknown bureau layout')
  assert.equal((result as { unsupported: true }).unsupported, true)
})

test('parser: structured-HTML adapter extracts tradelines with provenance, masking, and correct minor-unit balances', () => {
  const result = parseReportContent(fictitiousHtml)
  if (!('report' in result)) throw new Error('expected a report')
  const report: ParserReport = result.report
  assert.equal(report.tradelines.length, 2)
  const [eq, ex] = report.tradelines as [ParserTradeline, ParserTradeline]
  assert.notEqual(eq.bureau, ex.bureau)
  assert.equal(eq.balance.normalized, 12500) // $125.00 in minor units
  assert.equal(ex.balance.normalized, 15000)
  assert.equal(eq.maskedAccount, '••••5678')
  assert.equal(eq.balance.source.kind, 'element')
  assert.match(eq.balance.source.locator, /tradelines\/tr\[0\]\/td\[3\]/)
  assert.equal(eq.balance.originalDisplay, '$125.00')
  assert.equal(eq.balance.confidence, 1)
  assert.equal(report.reportDate, '2026-07-01')
})

test('parser: inbound redaction runs before extraction — an injected SSN cannot reach the parsed report', () => {
  const withSsn = fictitiousHtml.replace('</body>', '<div>contact ssn 123-45-6789</div></body>')
  const result = parseReportContent(withSsn)
  if (!('report' in result)) throw new Error('expected a report')
  assert.equal(containsUnredactedIdentifier(JSON.stringify(result.report)), false)
  assert.ok(!JSON.stringify(result.report).includes('123-45-6789'))
})

test('parser end-to-end: fictitious HTML -> parser -> deterministic core produces a real Finding (no fictional JSON)', () => {
  const parsed = parseReportContent(fictitiousHtml)
  if (!('report' in parsed)) throw new Error('expected a report')
  const tradelines = parsed.report.tradelines as unknown as EvaluableTradeline[] // structurally compatible
  const analysis = evaluateAnalysis({
    rules: [balanceRule()],
    tradelines,
    confirmedMatches: [{ tradelineIds: tradelines.map(t => t.id) }],
    versions: { normalizedInput: 1, ruleset: 'rs-1', jurisdiction: 'US-CA', parser: 'fictitious-html-v1', application: 'test' },
  })
  assert.equal(analysis.findings.length, 1)
  assert.equal(analysis.findings[0]?.classification, 'verification-recommended')
  assert.equal(analysis.audit[0]?.outcome, 'triggered')
})

test('parser field-precision: an unparseable balance is null + unknown, never an invented number', () => {
  const withBadBalance = fictitiousHtml.replace('$125.00', 'N/A')
  const result = parseReportContent(withBadBalance)
  if (!('report' in result)) throw new Error('expected a report')
  const eq = result.report.tradelines[0]!
  assert.equal(eq.balance.normalized, null)
  assert.equal(eq.balance.state, 'unknown')
  assert.equal(eq.balance.confidence, 0)
  // and because one balance is unknown, analysis must SUPPRESS (no weak finding)
  const tradelines = result.report.tradelines as unknown as EvaluableTradeline[]
  const analysis = evaluateAnalysis({ rules: [balanceRule()], tradelines, confirmedMatches: [{ tradelineIds: tradelines.map(t => t.id) }], versions: { normalizedInput: 1, ruleset: 'rs-1', jurisdiction: 'US-CA', parser: 'fictitious-html-v1', application: 'test' } })
  assert.equal(analysis.findings.length, 0)
  assert.equal(analysis.audit[0]?.outcome, 'suppressed')
})
