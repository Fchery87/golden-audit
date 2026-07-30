import test from 'node:test'
import assert from 'node:assert/strict'
import { CreditAnalysisPlatform } from '../packages/platform/src/index.js'

test('pilot reviewer markdown export: renders bundle status, approvals, evidence surfaces, and drill follow-ups', () => {
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

  const markdown = platform.renderPilotReviewerMarkdown({
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

  assert.match(markdown, /^# Pilot reviewer export/m)
  assert.match(markdown, /Pilot gate: ready/)
  assert.match(markdown, /Open approval areas: none/)
  assert.match(markdown, /Failing evidence surfaces: accessibility, drills, narration/)
  assert.match(markdown, /## Approvals/)
  assert.match(markdown, /- product: product-owner \(approval\/product.md\)/)
  assert.match(markdown, /## Evidence surfaces/)
  assert.match(markdown, /- Accessibility: failing \(6\/7 checks passed; missing: readableExport\)/)
  assert.match(markdown, /- Comprehension: passing \(7\/7 checks passed\)/)
  assert.match(markdown, /- Narration: failing \(violations: dispute-term:file a dispute\)/)
  assert.match(markdown, /## Drill follow-ups/)
  assert.match(markdown, /- Deletion failure — blocked — owner: security-owner — follow-up: \.scratch\/personal-credit-analysis-platform\/issues\/24-pilot-drill-evidence-reporting.md/)
})

test('pilot reviewer markdown export: renders missing approvals and no drill follow-ups when clean', () => {
  const platform = new CreditAnalysisPlatform()
  const markdown = platform.renderPilotReviewerMarkdown({
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

  assert.match(markdown, /Pilot gate: not ready/)
  assert.match(markdown, /Open approval areas: product, legal, privacy, security, operations, accessibility, vendor/)
  assert.match(markdown, /Failing evidence surfaces: comprehension/)
  assert.match(markdown, /## Drill follow-ups\n\n- None\./)
})
