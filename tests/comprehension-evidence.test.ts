import test from 'node:test'
import assert from 'node:assert/strict'
import { evaluateComprehensionEvidence } from '../apps/web/src/comprehension-report.js'

const surface = {
  plainLanguageBoundary: true,
  stateSelectionHelp: true,
  educationalLimitations: true,
  explanationOrientedCopy: true,
  noScorePromise: true,
  noDisputePromise: true,
  readableTerminology: true,
}

test('comprehension evidence: reports full coverage for explanatory pilot copy', () => {
  const summary = evaluateComprehensionEvidence(surface)
  assert.equal(summary.passed, true)
  assert.equal(summary.coverage.totalChecks, 7)
  assert.equal(summary.coverage.passedChecks, 7)
  assert.equal(summary.coverage.failedChecks, 0)
  assert.equal(summary.missing.length, 0)
})

test('comprehension evidence: reports missing user-facing explanation gaps', () => {
  const summary = evaluateComprehensionEvidence({ ...surface, noScorePromise: false, readableTerminology: false })
  assert.equal(summary.passed, false)
  assert.equal(summary.coverage.totalChecks, 7)
  assert.equal(summary.coverage.passedChecks, 5)
  assert.equal(summary.coverage.failedChecks, 2)
  assert.deepEqual(summary.missing.sort(), ['noScorePromise', 'readableTerminology'])
})
