import test from 'node:test'
import assert from 'node:assert/strict'
import { validateConsumerOutput, assertSafeConsumerOutput, FORBIDDEN_OUTPUT_TERMS, FORBIDDEN_DISPUTE_TERMS, FORBIDDEN_UPL_TERMS } from '../packages/output-guard/src/index.js'

test('output-guard: rejects counsel-forbidden credit-improvement vocabulary', () => {
  for (const term of ['fix your credit', 'improve your score', 'boost your score', 'remove negative items', 'get approved faster']) {
    const result = validateConsumerOutput(term)
    assert.equal(result.ok, false, `expected "${term}" to be blocked`)
    assert.ok(result.violations.some(v => v.startsWith('forbidden-term')))
  }
})

test('output-guard: rejects unredacted identifiers', () => {
  const result = validateConsumerOutput('on file: 123-45-6789')
  assert.equal(result.ok, false)
  assert.ok(result.violations.includes('unredacted-identifier'))
})

test('output-guard: passes clean educational output', () => {
  const result = validateConsumerOutput('Bureau balances differ. Different update dates can explain a difference. Verify with the creditor.')
  assert.equal(result.ok, true)
  assert.deepEqual(result.violations, [])
})

test('output-guard: assertSafeConsumerOutput throws fail-closed and lists every violation', () => {
  assert.throws(
    () => assertSafeConsumerOutput('we will fix your credit and remove negative items; ssn 111-22-3333'),
    /Output blocked at trust boundary:.*forbidden-term.*unredacted-identifier/s,
  )
  assert.doesNotThrow(() => assertSafeConsumerOutput('clean output'))
})

test('output-guard: FORBIDDEN_OUTPUT_TERMS is non-empty and includes the core CROA triggers', () => {
  assert.ok(FORBIDDEN_OUTPUT_TERMS.length >= 10)
  const asSet = new Set<string>(FORBIDDEN_OUTPUT_TERMS)
  for (const core of ['credit repair', 'improve your score', 'guarantee']) assert.ok(asSet.has(core))
})

test('output-guard: blocks dispute-generation language (Q-L2 — no communication to bureaus/furnishers)', () => {
  assert.ok(FORBIDDEN_DISPUTE_TERMS.length >= 5)
  for (const term of FORBIDDEN_DISPUTE_TERMS) {
    const result = validateConsumerOutput(`we can ${term} on your behalf`)
    assert.equal(result.ok, false, `expected dispute term "${term}" to be blocked`)
    assert.ok(result.violations.some(v => v.startsWith('dispute-term')), `expected dispute-term violation for "${term}"`)
  }
})

test('output-guard: blocks unauthorized-practice-of-law conclusions (Q-L5 — no statute applied to the consumer facts)', () => {
  assert.ok(FORBIDDEN_UPL_TERMS.length >= 10)
  for (const term of FORBIDDEN_UPL_TERMS) {
    const result = validateConsumerOutput(`The bureau ${term}, so you may have recourse.`)
    assert.equal(result.ok, false, `expected UPL term "${term}" to be blocked`)
    assert.ok(result.violations.some(v => v.startsWith('upl-term')), `expected upl-term violation for "${term}"`)
  }
})
