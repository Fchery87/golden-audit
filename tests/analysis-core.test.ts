import test from 'node:test'
import assert from 'node:assert/strict'
import { evaluateAnalysis, type EvaluableRule, type EvaluableTradeline } from '../packages/analysis-core/src/index.js'

const rule = (overrides: Partial<EvaluableRule> = {}): EvaluableRule => ({
  id: 'rule-1',
  name: 'cross-bureau-balance-difference',
  status: 'published',
  minimumConfidence: 0.9,
  classification: 'verification-recommended',
  limitations: ['Different update dates can explain a difference'],
  authorityIds: ['auth-1'],
  educationModuleIds: ['edu-1'],
  ...overrides,
})

const tradeline = (id: string, balance: number, confidence = 1): EvaluableTradeline => ({
  id,
  balance: { normalized: balance, confidence, source: { kind: 'page', locator: `${id}:balance`, snippet: `$${balance}` } },
})

const versions = { normalizedInput: 1, ruleset: 'rs-1', jurisdiction: 'US-CA', parser: 'p-1', application: 'test' }

test('analysis-core: same inputs + ruleset reproduce identical findings (deterministic)', () => {
  const input = { rules: [rule()], tradelines: [tradeline('a', 12500), tradeline('b', 15000)], confirmedMatches: [{ tradelineIds: ['a', 'b'] }], versions }
  const first = evaluateAnalysis(input)
  const second = evaluateAnalysis(input)
  assert.equal(first.findings.length, 1)
  assert.deepEqual(first.audit, second.audit)
  assert.deepEqual(first.findings.map(({ id: _id, ...f }) => f), second.findings.map(({ id: _id, ...f }) => f))
  assert.equal(first.findings[0]?.classification, 'verification-recommended')
})

test('analysis-core: low-confidence or missing evidence is suppressed, not turned into a weak finding', () => {
  const result = evaluateAnalysis({ rules: [rule()], tradelines: [tradeline('a', 100, 0.4), tradeline('b', 200)], confirmedMatches: [{ tradelineIds: ['a', 'b'] }], versions })
  assert.equal(result.findings.length, 0)
  assert.equal(result.audit[0]?.outcome, 'suppressed')
})

test('analysis-core: matching balances produce no finding and a skipped audit', () => {
  const result = evaluateAnalysis({ rules: [rule()], tradelines: [tradeline('a', 100), tradeline('b', 100)], confirmedMatches: [{ tradelineIds: ['a', 'b'] }], versions })
  assert.equal(result.findings.length, 0)
  assert.equal(result.audit[0]?.outcome, 'skipped')
})

test('analysis-core: disabled rules are skipped; unknown rules are skipped; duplicate evidence is deduplicated', () => {
  const dupes = [{ tradelineIds: ['a', 'b'] }, { tradelineIds: ['a', 'b'] }]
  const result = evaluateAnalysis({
    rules: [rule({ id: 'r-disabled', status: 'disabled' }), rule({ id: 'r-unknown', name: 'no-such-evaluator' }), rule()],
    tradelines: [tradeline('a', 100), tradeline('b', 200)],
    confirmedMatches: dupes,
    versions,
  })
  // one real finding despite two matching groups (dedup), plus skipped entries for disabled + unknown
  assert.equal(result.findings.length, 1)
  const outcomes = result.audit.map(a => a.outcome).sort()
  assert.ok(outcomes.includes('skipped'))
  assert.ok(result.audit.some(a => a.reason === 'Rule disabled'))
  assert.ok(result.audit.some(a => a.reason === 'No supported evaluator for this rule'))
})

test('analysis-core: engine imports nothing from platform/domain (ingest-agnostic)', async () => {
  const files = ['taxonomy', 'evidence', 'findings', 'engine', 'index']
  for (const f of files) {
    const src = await import(`node:fs/promises`).then(fs => fs.readFile(`packages/analysis-core/src/${f}.ts`, 'utf8'))
    assert.doesNotMatch(src, /from ['"]\.\.\/\.\.\/(platform|domain)/, `${f}.ts must not depend on platform/domain`)
  }
})
