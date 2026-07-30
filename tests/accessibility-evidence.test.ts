import test from 'node:test'
import assert from 'node:assert/strict'
import { evaluateAccessibilityEvidence } from '../apps/web/src/accessibility-report.js'

const checklist = {
  skipLink: true,
  ariaLiveStatus: true,
  focusVisibleStyles: true,
  labeledInputs: true,
  reducedMotionRespect: true,
  readableExport: true,
  keyboardPaths: true,
}

test('accessibility evidence: reports full WCAG evidence coverage when all checks pass', () => {
  const summary = evaluateAccessibilityEvidence(checklist)
  assert.equal(summary.passed, true)
  assert.equal(summary.coverage.totalChecks, 7)
  assert.equal(summary.coverage.passedChecks, 7)
  assert.equal(summary.coverage.failedChecks, 0)
  assert.equal(summary.missing.length, 0)
})

test('accessibility evidence: reports missing checks without claiming compliance', () => {
  const summary = evaluateAccessibilityEvidence({ ...checklist, readableExport: false, keyboardPaths: false })
  assert.equal(summary.passed, false)
  assert.equal(summary.coverage.totalChecks, 7)
  assert.equal(summary.coverage.passedChecks, 5)
  assert.equal(summary.coverage.failedChecks, 2)
  assert.deepEqual(summary.missing.sort(), ['keyboardPaths', 'readableExport'])
})
