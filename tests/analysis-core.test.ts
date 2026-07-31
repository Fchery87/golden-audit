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

test('analysis-core: cross-bureau comparison requires distinct bureaus', () => {
  const sameBureau: EvaluableTradeline[] = [
    {
      id: 'a',
      bureau: 'equifax',
      balance: { normalized: 100, confidence: 1, source: { kind: 'page', locator: 'a:balance', snippet: '$1.00' } },
      status: { normalized: 'Open', confidence: 1, source: { kind: 'page', locator: 'a:status', snippet: 'Open' } },
    },
    {
      id: 'b',
      bureau: 'equifax',
      balance: { normalized: 200, confidence: 1, source: { kind: 'page', locator: 'b:balance', snippet: '$2.00' } },
      status: { normalized: 'Closed', confidence: 1, source: { kind: 'page', locator: 'b:status', snippet: 'Closed' } },
    },
  ]
  const result = evaluateAnalysis({ rules: [rule()], tradelines: sameBureau, confirmedMatches: [{ tradelineIds: ['a', 'b'] }], versions })
  assert.equal(result.findings.length, 0)
  assert.equal(result.audit[0]?.outcome, 'skipped')
  assert.match(result.audit[0]?.reason ?? '', /distinct bureaus/i)
})

test('analysis-core: partial furnishing produces a low-severity observed-fact', () => {
  const partialRule: EvaluableRule = {
    id: 'partial-1',
    name: 'partial-furnishing-observation',
    status: 'published',
    minimumConfidence: 0.9,
    classification: 'observed-fact',
    limitations: ['Not every account is expected to appear on all three bureaus'],
    authorityIds: ['auth-1'],
    educationModuleIds: ['edu-1'],
  }
  const tradelines: EvaluableTradeline[] = [
    { id: 'a', bureau: 'equifax', maskedAccount: { normalized: '••••1111', source: { kind: 'page', locator: 'a:account', snippet: '1111' } }, balance: { normalized: 100, confidence: 1, source: { kind: 'page', locator: 'a:balance', snippet: '$1.00' } } },
    { id: 'b', bureau: 'experian', maskedAccount: { normalized: '••••1111', source: { kind: 'page', locator: 'b:account', snippet: '1111' } }, balance: { normalized: 100, confidence: 1, source: { kind: 'page', locator: 'b:balance', snippet: '$1.00' } } },
  ]
  const result = evaluateAnalysis({ rules: [partialRule], tradelines, confirmedMatches: [{ tradelineIds: ['a', 'b'] }], versions })
  assert.equal(result.findings.length, 1)
  assert.equal(result.findings[0]?.classification, 'observed-fact')
  assert.equal(result.findings[0]?.severity, 'low')
  assert.match(result.findings[0]?.title ?? '', /fewer than three bureaus/i)
})

test('analysis-core: slice-one money divergence and internal contradictions remain strict', () => {
  const source = (field: string) => ({ kind: 'page' as const, locator: field, snippet: field })
  const lines: EvaluableTradeline[] = [
    {
      id: 'eq', bureau: 'equifax',
      accountType: { normalized: 'Revolving', confidence: 1, source: source('eq:type') },
      balance: { normalized: 10000, confidence: 1, source: source('eq:balance') },
      creditLimit: { normalized: 100000, confidence: 1, source: source('eq:limit') },
      pastDue: { normalized: 12000, confidence: 1, source: source('eq:past-due') },
      status: { normalized: 'Closed', confidence: 1, source: source('eq:status') },
    },
    {
      id: 'ex', bureau: 'experian',
      accountType: { normalized: 'Revolving', confidence: 1, source: source('ex:type') },
      balance: { normalized: 10000, confidence: 1, source: source('ex:balance') },
      creditLimit: { normalized: 125000, confidence: 1, source: source('ex:limit') },
      pastDue: { normalized: 0, confidence: 1, source: source('ex:past-due') },
      status: { normalized: 'Closed', confidence: 1, source: source('ex:status') },
    },
  ]
  const rules: EvaluableRule[] = [
    rule({ id: 'limit', name: 'cross-bureau-credit-limit-difference' }),
    rule({ id: 'past-due', name: 'cross-bureau-past-due-difference' }),
    rule({ id: 'closed-balance', name: 'closed-or-paid-with-balance' }),
    rule({ id: 'past-due-balance', name: 'past-due-exceeds-balance' }),
  ]
  const result = evaluateAnalysis({ rules, tradelines: lines, confirmedMatches: [{ tradelineIds: ['eq', 'ex'] }], versions })
  assert.deepEqual(result.findings.map(finding => finding.title).sort(), [
    'Bureau credit limits differ',
    'Bureau past-due amounts differ',
    'Closed or paid account reports a balance',
    'Closed or paid account reports a balance',
    'Past-due amount exceeds reported balance',
  ])
  assert.equal(result.audit.filter(item => item.outcome === 'triggered').length, 5)
})

test('analysis-core: revolving account without limit is observed only when the type is known', () => {
  const source = { kind: 'page' as const, locator: 'type', snippet: 'Revolving' }
  const ruleForLimit: EvaluableRule = rule({
    id: 'revolving',
    name: 'revolving-without-credit-limit',
    classification: 'observed-fact',
  })
  const withMissingLimit: EvaluableTradeline = {
    id: 'a', bureau: 'equifax',
    accountType: { normalized: 'Revolving', confidence: 1, source },
    balance: { normalized: 100, confidence: 1, source },
    creditLimit: { normalized: null, confidence: 0, source },
  }
  const withUnknownType: EvaluableTradeline = {
    ...withMissingLimit,
    id: 'b',
    accountType: { normalized: null, confidence: 0, source },
  }
  const observed = evaluateAnalysis({ rules: [ruleForLimit], tradelines: [withMissingLimit], confirmedMatches: [{ tradelineIds: ['a'] }], versions })
  assert.equal(observed.findings.length, 1)
  assert.equal(observed.findings[0]?.classification, 'observed-fact')
  const suppressed = evaluateAnalysis({ rules: [ruleForLimit], tradelines: [withUnknownType], confirmedMatches: [{ tradelineIds: ['b'] }], versions })
  assert.equal(suppressed.findings.length, 0)
  assert.equal(suppressed.audit[0]?.outcome, 'suppressed')
})

test('analysis-core: engine imports nothing from platform/domain (ingest-agnostic)', async () => {
  const files = ['taxonomy', 'evidence', 'findings', 'engine', 'index']
  for (const f of files) {
    const src = await import(`node:fs/promises`).then(fs => fs.readFile(`packages/analysis-core/src/${f}.ts`, 'utf8'))
    assert.doesNotMatch(src, /from ['"]\.\.\/\.\.\/(platform|domain)/, `${f}.ts must not depend on platform/domain`)
  }
})
