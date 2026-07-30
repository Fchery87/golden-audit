import test from 'node:test'
import assert from 'node:assert/strict'
import { CreditAnalysisPlatform } from '../packages/platform/src/index.js'

test('pilot drills: records date, owner, result, gaps, and follow-up ticket', () => {
  const platform = new CreditAnalysisPlatform()
  const record = platform.recordPilotDrill({
    scenario: 'Parser regression',
    owner: 'ops-owner',
    result: 'passed-with-gaps',
    gaps: ['rollback rehearse not yet documented'],
    followUpTicket: '.scratch/personal-credit-analysis-platform/issues/23-pilot-drill-recording.md',
  })

  assert.equal(record.scenario, 'Parser regression')
  assert.equal(record.owner, 'ops-owner')
  assert.equal(record.result, 'passed-with-gaps')
  assert.deepEqual(record.gaps, ['rollback rehearse not yet documented'])
  assert.equal(record.followUpTicket, '.scratch/personal-credit-analysis-platform/issues/23-pilot-drill-recording.md')
  assert.match(record.recordedAt, /^\d{4}-\d{2}-\d{2}T/)
})

test('pilot drills: lists recorded drills in insertion order', () => {
  const platform = new CreditAnalysisPlatform()
  platform.recordPilotDrill({ scenario: 'Parser regression', owner: 'ops-owner', result: 'passed', gaps: [], followUpTicket: '.scratch/personal-credit-analysis-platform/issues/23-pilot-drill-recording.md' })
  platform.recordPilotDrill({ scenario: 'Deletion failure', owner: 'security-owner', result: 'blocked', gaps: ['backup lifecycle evidence missing'], followUpTicket: '.scratch/personal-credit-analysis-platform/issues/23-pilot-drill-recording.md' })

  const drills = platform.getPilotDrills()
  assert.equal(drills.length, 2)
  assert.equal(drills[0]?.scenario, 'Parser regression')
  assert.equal(drills[1]?.scenario, 'Deletion failure')
})
