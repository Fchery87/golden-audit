import test from 'node:test'
import assert from 'node:assert/strict'
import { CreditAnalysisPlatform } from '../packages/platform/src/index.js'

test('pilot reviewer JSON export: serializes bundle with stable reviewer fields', async () => {
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
    scenario: 'Deletion failure',
    owner: 'security-owner',
    result: 'blocked',
    gaps: ['backup lifecycle evidence missing'],
    followUpTicket: '.scratch/personal-credit-analysis-platform/issues/24-pilot-drill-evidence-reporting.md',
  })

  const json = await platform.renderPilotReviewerJson({
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

  const parsed = JSON.parse(json) as {
    generatedAt: string
    pilotGate: { ready: boolean; missing: string[] }
    summary: { openApprovalAreas: string[]; failingEvidenceSurfaces: string[] }
    drills: { totalDrills: number; openGaps: Array<{ scenario: string; owner: string; result: string; followUpTicket: string }> }
    markdown: string
  }

  assert.match(parsed.generatedAt, /^\d{4}-\d{2}-\d{2}T/)
  assert.equal(parsed.pilotGate.ready, true)
  assert.deepEqual(parsed.summary.openApprovalAreas, [])
  assert.deepEqual(parsed.summary.failingEvidenceSurfaces, ['accessibility', 'drills', 'narration'])
  assert.equal(parsed.drills.totalDrills, 1)
  assert.equal(parsed.drills.openGaps[0]?.scenario, 'Deletion failure')
  assert.match(parsed.markdown, /# Pilot reviewer export/)
  assert.match(parsed.markdown, /Failing evidence surfaces: accessibility, drills, narration/)
})

test('pilot reviewer JSON export: preserves incomplete-state summary when approvals are missing', async () => {
  const platform = new CreditAnalysisPlatform()
  const json = await platform.renderPilotReviewerJson({
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
  const parsed = JSON.parse(json) as { pilotGate: { ready: boolean }; summary: { openApprovalAreas: string[]; failingEvidenceSurfaces: string[] }; drills: { totalDrills: number } }

  assert.equal(parsed.pilotGate.ready, false)
  assert.deepEqual(parsed.summary.openApprovalAreas, ['product', 'legal', 'privacy', 'security', 'operations', 'accessibility', 'vendor'])
  assert.deepEqual(parsed.summary.failingEvidenceSurfaces, ['comprehension'])
  assert.equal(parsed.drills.totalDrills, 0)
})
