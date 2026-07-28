import test from 'node:test'
import assert from 'node:assert/strict'
import { evaluateAnalysis, type EvaluableRule, type EvaluableTradeline, type MatchRef } from '../packages/analysis-core/src/index.js'

// Ticket 14 — measurement harness, part 1: synthetic LABELED corpus.
// Ground truth is known by construction (which account-groups differ), so we can compute the
// engine's TRUE precision/recall/determinism — no PII, fully reproducible in CI.

const versions = { normalizedInput: 1, ruleset: 'rs-1', jurisdiction: 'US-CA', parser: 'synthetic', application: 'measurement' }
const rule: EvaluableRule = { id: 'r', name: 'cross-bureau-balance-difference', status: 'published', minimumConfidence: 0.9, classification: 'verification-recommended', limitations: [], authorityIds: [], educationModuleIds: [] }
const tl = (id: string, balance: number | null, confidence = 1): EvaluableTradeline => ({ id, balance: { normalized: balance, confidence, source: { kind: 'page', locator: id, snippet: '' } } })

type Label = 'differ' | 'agree' | 'suppressed'
type Group = { id: string; label: Label; balances: Array<number | null>; confidences?: number[] }

function corpus(groups: Group[]): { tradelines: EvaluableTradeline[]; matches: MatchRef[] } {
  const tradelines: EvaluableTradeline[] = []; const matches: MatchRef[] = []
  for (const g of groups) {
    const ids: string[] = []
    g.balances.forEach((b, i) => { const id = `${g.id}#${i}`; tradelines.push(tl(id, b, g.confidences?.[i] ?? 1)); ids.push(id) })
    matches.push({ tradelineIds: ids })
  }
  return { tradelines, matches }
}

// A labeled grid spanning: 2- and 3-bureau matches; agree / differ / suppressed; tiny and large magnitudes.
const GRID: Group[] = [
  { id: 'agree2', label: 'agree', balances: [10000, 10000] },
  { id: 'agree3', label: 'agree', balances: [25000, 25000, 25000] },
  { id: 'differ2tiny', label: 'differ', balances: [10000, 10001] },        // $0.01 diff
  { id: 'differ2large', label: 'differ', balances: [10000, 500000] },
  { id: 'differ3', label: 'differ', balances: [10000, 20000, 15000] },
  { id: 'differ3large', label: 'differ', balances: [100000, 300000, 200000] },
  { id: 'suppLowConf', label: 'suppressed', balances: [10000, 20000], confidences: [0.5, 1] },
  { id: 'suppNull', label: 'suppressed', balances: [10000, null] },
  { id: 'agree3b', label: 'agree', balances: [5000, 5000, 5000] },
]

test('measurement: engine precision = 1.0 and recall = 1.0 over the labeled corpus', () => {
  const { tradelines, matches } = corpus(GRID)
  const result = evaluateAnalysis({ rules: [rule], tradelines, confirmedMatches: matches, versions })
  const idToGroup = new Map<string, string>()
  for (const g of GRID) g.balances.forEach((_, i) => idToGroup.set(`${g.id}#${i}`, g.id))
  const firedGroups = new Set(result.findings.map(f => idToGroup.get(f.evidence[0]?.tradelineId ?? '')).filter((x): x is string => x !== ''))
  const findable = GRID.filter(g => g.label === 'differ').map(g => g.id)
  const agree = GRID.filter(g => g.label === 'agree').map(g => g.id)
  const supp = GRID.filter(g => g.label === 'suppressed').map(g => g.id)
  const tp = findable.filter(id => firedGroups.has(id))
  const fp = [...firedGroups].filter(id => !findable.includes(id))
  const recall = tp.length / findable.length
  const precision = firedGroups.size === 0 ? 1 : tp.length / firedGroups.size
  console.log(`  [engine measurement] groups=${GRID.length} findable(differ)=${findable.length} fired=${firedGroups.size} recall=${recall.toFixed(2)} precision=${precision.toFixed(2)} falsePositives=${fp.length}`)
  assert.equal(recall, 1, `recall must be 1.0 — missed: ${findable.filter(id => !firedGroups.has(id)).join(',')}`)
  assert.equal(precision, 1, `precision must be 1.0 — false positives: ${fp.join(',')}`)
  assert.deepEqual(agree.filter(id => firedGroups.has(id)), [], 'agree groups must never fire')
  assert.deepEqual(supp.filter(id => firedGroups.has(id)), [], 'suppressed groups must never fire')
  assert.ok(result.audit.some(a => a.outcome === 'suppressed'), 'suppressed cases must be audited')
})

test('measurement: engine is magnitude-agnostic — any nonzero difference fires', () => {
  // A $0.01 difference still produces a finding. This is CORRECT engine behavior, and it is exactly
  // why the real-sample magnitude characterization matters: the engine cannot tell a timing artifact
  // from a material difference — that distinction must be MEASURED, not assumed by the engine.
  const { tradelines, matches } = corpus([{ id: 'tiny', label: 'differ', balances: [10000, 10001] }])
  const result = evaluateAnalysis({ rules: [rule], tradelines, confirmedMatches: matches, versions })
  assert.equal(result.findings.length, 1, 'a $0.01 difference must fire (engine is magnitude-agnostic by design)')
})

test('measurement: determinism — identical inputs reproduce identical findings + audit', () => {
  const { tradelines, matches } = corpus(GRID)
  const a = evaluateAnalysis({ rules: [rule], tradelines, confirmedMatches: matches, versions })
  const b = evaluateAnalysis({ rules: [rule], tradelines, confirmedMatches: matches, versions })
  assert.deepEqual(a.audit, b.audit)
  assert.deepEqual(a.findings.map(({ id: _id, ...f }) => f), b.findings.map(({ id: _id, ...f }) => f))
})

test('measurement: minimumMagnitude down-ranks sub-threshold findings (low severity + flag), not suppressed', () => {
  // Ticket 17 — a real-but-trivial difference is NOT suppressed (CONTEXT.md reserves suppression for
  // missing/low-confidence/ambiguous/non-comparable evidence). It still fires, but at 'low' severity
  // with a 'likely reporting-date artifact' flag so the consumer can skim past it.
  const thresholdRule: EvaluableRule = { ...rule, minimumMagnitude: 1000 } // $10 = 1000 cents
  const groups: Group[] = [
    { id: 'tiny', label: 'differ', balances: [10000, 10050] },       // $0.50 diff
    { id: 'material', label: 'differ', balances: [10000, 500000] },   // $4900 diff
  ]
  const { tradelines, matches } = corpus(groups)
  const result = evaluateAnalysis({ rules: [thresholdRule], tradelines, confirmedMatches: matches, versions })
  assert.equal(result.findings.length, 2, 'both must still fire — down-rank is not suppression')
  const idToGroup = new Map<string, string>()
  for (const g of groups) g.balances.forEach((_, i) => idToGroup.set(`${g.id}#${i}`, g.id))
  const byGroup = new Map(result.findings.map(f => [idToGroup.get(f.evidence[0]?.tradelineId ?? '') ?? '', f]))
  const tiny = byGroup.get('tiny'); const material = byGroup.get('material')
  assert.ok(tiny && material)
  assert.equal(tiny!.severity, 'low', 'sub-threshold finding down-ranked to low')
  assert.ok(tiny!.limitations.some(l => /reporting-date artifact/i.test(l)), 'sub-threshold flagged as likely timing')
  assert.equal(material!.severity, 'medium', 'above-threshold finding keeps medium severity')
  assert.ok(!material!.limitations.some(l => /reporting-date artifact/i.test(l)), 'above-threshold not flagged')
})

test('measurement: absent minimumMagnitude leaves behavior unchanged (medium severity)', () => {
  const { tradelines, matches } = corpus([{ id: 'tiny', label: 'differ', balances: [10000, 10001] }])
  const result = evaluateAnalysis({ rules: [rule], tradelines, confirmedMatches: matches, versions }) // rule has no minimumMagnitude
  assert.equal(result.findings.length, 1)
  assert.equal(result.findings[0]?.severity, 'medium', 'no threshold = no down-ranking (backward compatible)')
})
