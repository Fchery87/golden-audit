import test from 'node:test'
import assert from 'node:assert/strict'
import { CreditAnalysisPlatform } from '../packages/platform/src/index.js'

test('pilot drill evidence report: summarizes outcomes, gaps, and follow-up tickets', () => {
  const platform = new CreditAnalysisPlatform()
  platform.recordPilotDrill({
    scenario: 'Parser regression',
    owner: 'ops-owner',
    result: 'passed-with-gaps',
    gaps: ['rollback runbook needs screenshots'],
    followUpTicket: '.scratch/personal-credit-analysis-platform/issues/23-pilot-drill-recording.md',
  })
  platform.recordPilotDrill({
    scenario: 'Deletion failure',
    owner: 'security-owner',
    result: 'blocked',
    gaps: ['backup lifecycle evidence missing'],
    followUpTicket: '.scratch/personal-credit-analysis-platform/issues/24-pilot-drill-evidence-reporting.md',
  })
  platform.recordPilotDrill({
    scenario: 'Model/provider outage',
    owner: 'ops-owner',
    result: 'passed',
    gaps: [],
    followUpTicket: '.scratch/personal-credit-analysis-platform/issues/24-pilot-drill-evidence-reporting.md',
  })

  const report = platform.getPilotDrillEvidenceReport()
  assert.match(report.generatedAt, /^\d{4}-\d{2}-\d{2}T/)
  assert.equal(report.totalDrills, 3)
  assert.deepEqual(report.outcomes, {
    passed: 1,
    'passed-with-gaps': 1,
    blocked: 1,
  })
  assert.deepEqual(report.openGaps, [
    {
      scenario: 'Parser regression',
      owner: 'ops-owner',
      result: 'passed-with-gaps',
      gaps: ['rollback runbook needs screenshots'],
      followUpTicket: '.scratch/personal-credit-analysis-platform/issues/23-pilot-drill-recording.md',
    },
    {
      scenario: 'Deletion failure',
      owner: 'security-owner',
      result: 'blocked',
      gaps: ['backup lifecycle evidence missing'],
      followUpTicket: '.scratch/personal-credit-analysis-platform/issues/24-pilot-drill-evidence-reporting.md',
    },
  ])
  assert.deepEqual(report.followUpTickets, [
    '.scratch/personal-credit-analysis-platform/issues/23-pilot-drill-recording.md',
    '.scratch/personal-credit-analysis-platform/issues/24-pilot-drill-evidence-reporting.md',
  ])
})

test('pilot drill evidence report: returns empty summary when no drills are recorded', () => {
  const platform = new CreditAnalysisPlatform()
  const report = platform.getPilotDrillEvidenceReport()

  assert.equal(report.totalDrills, 0)
  assert.deepEqual(report.outcomes, {
    passed: 0,
    'passed-with-gaps': 0,
    blocked: 0,
  })
  assert.deepEqual(report.openGaps, [])
  assert.deepEqual(report.followUpTickets, [])
})
