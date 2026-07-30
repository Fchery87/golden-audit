import test from 'node:test'
import assert from 'node:assert/strict'
import { parseReportContent, evaluateParserFields } from '../packages/parser/src/index.js'

const fixtureHtml = `<html><head><meta name="report-date" content="2026-07-01"></head><body>
<section data-cp="tradelines"><h2>Accounts</h2><table><tbody>
<tr data-bureau="equifax"><td>Example Bank</td><td>****5678</td><td>$125.00</td><td>Open</td><td>2020-01</td><td>2026-06-30</td></tr>
<tr data-bureau="experian"><td>Example Bank</td><td>****5678</td><td>$150.00</td><td>Open</td><td>2020-01</td><td>2026-06-28</td></tr>
</tbody></table></section></body></html>`

test('parser evaluation: precision/recall counts matched, missing, and unexpected fields', () => {
  const parsed = parseReportContent(fixtureHtml)
  if (!('report' in parsed)) throw new Error('expected a report')

  const summary = evaluateParserFields([
    { label: 'reportDate', expected: '2026-07-01', actual: parsed.report.reportDate },
    { label: 'first creditor', expected: 'Example Bank', actual: parsed.report.tradelines[0]?.creditor },
    { label: 'first balance', expected: 12500, actual: parsed.report.tradelines[0]?.balance.normalized },
    { label: 'second balance', expected: 15000, actual: parsed.report.tradelines[1]?.balance.normalized },
    { label: 'missing middle name', expected: 'A Consumer', actual: undefined },
    { label: 'unexpected parser field', expected: undefined, actual: 'spurious' },
  ])

  assert.equal(summary.observations, 6)
  assert.equal(summary.matched, 4)
  assert.equal(summary.missing, 1)
  assert.equal(summary.unexpected, 1)
  assert.equal(summary.precision, 4 / 5)
  assert.equal(summary.recall, 4 / 5)
  assert.equal(summary.byLabel[0]?.outcome, 'match')
  assert.equal(summary.byLabel[4]?.outcome, 'missing')
  assert.equal(summary.byLabel[5]?.outcome, 'unexpected')
})
