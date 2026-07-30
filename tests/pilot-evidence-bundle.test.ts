import test from 'node:test'
import assert from 'node:assert/strict'
import { CreditAnalysisPlatform } from '../packages/platform/src/index.js'

test('pilot evidence bundle: composes quality, drill, comprehension, accessibility, and narration evidence', () => {
  const platform = new CreditAnalysisPlatform()
  platform.configureLaunchScope({
    mode: 'one-state-free-pilot',
    approvedStates: ['US-CA'],
    provisionalSelectedState: 'US-CA',
    stateSelectionEvidenceReference: 'docs/launch-scope-decision-memo.md',
    availabilityClaim: 'Pilot limited to California.',
    pricingMode: 'free-pilot-only',
    nationwideStatus: 'state-by-state-review',
    notes: 'Educational-only pilot.',
  })
  for (const area of ['product', 'legal', 'privacy', 'security', 'operations', 'accessibility', 'vendor'] as const) {
    platform.recordPilotApproval({ area, approver: `${area}-owner`, evidenceReference: `approval/${area}.md` })
  }
  platform.recordPilotDrill({
    scenario: 'Parser regression',
    owner: 'ops-owner',
    result: 'passed-with-gaps',
    gaps: ['rollback screenshots missing'],
    followUpTicket: '.scratch/personal-credit-analysis-platform/issues/24-pilot-drill-evidence-reporting.md',
  })

  const bundle = platform.getPilotEvidenceBundle({
    comprehension: {
      passed: true,
      missing: [],
      coverage: { totalChecks: 7, passedChecks: 7, failedChecks: 0 },
    },
    accessibility: {
      passed: false,
      missing: ['readableExport'],
      coverage: { totalChecks: 7, passedChecks: 6, failedChecks: 1 },
    },
    narration: {
      safe: false,
      violations: ['dispute-term:file a dispute'],
      citationCoverage: {
        totalFindings: 1,
        coveredFindings: 1,
        missingFindings: 0,
        coveredLimitations: 0,
        missingLimitations: 1,
      },
    },
  })

  assert.match(bundle.generatedAt, /^\d{4}-\d{2}-\d{2}T/)
  assert.equal(bundle.pilotGate.ready, true)
  assert.equal(bundle.quality.segments.length, 0)
  assert.equal(bundle.drills.totalDrills, 1)
  assert.equal(bundle.comprehension.passed, true)
  assert.equal(bundle.accessibility.passed, false)
  assert.equal(bundle.narration?.safe, false)
  assert.deepEqual(bundle.summary.openApprovalAreas, [])
  assert.deepEqual(bundle.summary.failingEvidenceSurfaces, ['accessibility', 'drills', 'narration'])
})

test('pilot evidence bundle: reports incomplete approvals and only failing supplied surfaces', () => {
  const platform = new CreditAnalysisPlatform()

  const bundle = platform.getPilotEvidenceBundle({
    comprehension: {
      passed: false,
      missing: ['plainLanguageBoundary'],
      coverage: { totalChecks: 7, passedChecks: 6, failedChecks: 1 },
    },
    accessibility: {
      passed: true,
      missing: [],
      coverage: { totalChecks: 7, passedChecks: 7, failedChecks: 0 },
    },
  })

  assert.equal(bundle.pilotGate.ready, false)
  assert.deepEqual(bundle.summary.openApprovalAreas, ['product', 'legal', 'privacy', 'security', 'operations', 'accessibility', 'vendor'])
  assert.deepEqual(bundle.summary.failingEvidenceSurfaces, ['comprehension'])
})
