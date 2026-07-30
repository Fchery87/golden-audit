import test from 'node:test'
import assert from 'node:assert/strict'
import { evaluateNarrationOutput } from '../packages/output-guard/src/index.js'

const analysis = {
  findings: [
    {
      title: 'Balance difference',
      limitations: ['Different update dates can explain a difference'],
    },
  ],
}

test('narration evaluation: reports citation coverage and safety violations', () => {
  const summary = evaluateNarrationOutput({
    text: 'Balance difference. Different update dates can explain a difference.',
    analysis,
  })

  assert.equal(summary.safe, true)
  assert.equal(summary.citationCoverage.totalFindings, 1)
  assert.equal(summary.citationCoverage.coveredFindings, 1)
  assert.equal(summary.citationCoverage.missingFindings, 0)
  assert.equal(summary.citationCoverage.coveredLimitations, 1)
  assert.equal(summary.citationCoverage.missingLimitations, 0)
  assert.equal(summary.violations.length, 0)
})

test('narration evaluation: flags unsafe output and missing grounded language', () => {
  const summary = evaluateNarrationOutput({
    text: 'We guarantee results and can delete negative items.',
    analysis,
  })

  assert.equal(summary.safe, false)
  assert.ok(summary.violations.some(v => v.startsWith('forbidden-term')))
  assert.equal(summary.citationCoverage.coveredFindings, 0)
  assert.equal(summary.citationCoverage.missingFindings, 1)
  assert.equal(summary.citationCoverage.coveredLimitations, 0)
  assert.equal(summary.citationCoverage.missingLimitations, 1)
})
