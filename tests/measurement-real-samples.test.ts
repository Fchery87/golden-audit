import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { CreditAnalysisPlatform } from '../packages/platform/src/index.js'

// Ticket 14 — measurement harness, part 2: real-sample structural characterization.
// Runs the full chain on each real IdentityIQ PDF and profiles the findings by balance-difference
// MAGNITUDE (binned) — the engine is magnitude-agnostic, so this is the only signal for "real
// discrepancy vs timing artifact" without human-labeled ground truth.
//
// Structure-only: prints bin COUNTS and aggregates, never raw balances. Skip-if-absent because the
// reports are gitignored (lives in docs/reports/). Passes vacuously in CI when files are absent.

const password = 'correct horse battery staple'
const consent = { version: '2026-01', adultUSConsumer: true, authorizedReportUse: true, educationalLimitations: true, sensitiveDataHandling: true, residence: 'US-CA', analysisJurisdiction: 'US-CA' } as const

const PDFS = [
  'docs/reports/Credit Report - IdentityIQ.pdf',
  'docs/reports/Credit Report - IdentityIQ (copy).pdf',
  'docs/reports/Credit Report - IdentityIQ (another copy).pdf',
  'docs/reports/C_Pique_Credit Report - IdentityIQ.pdf',
]

let hasBin = false; try { execSync('command -v pdftotext', { stdio: 'ignore' }); hasBin = true } catch {}

function publishRules(p: CreditAnalysisPlatform): string {
  p.registerReviewer({ id: 'mr-r1', role: 'compliance-reviewer' }); p.registerReviewer({ id: 'mr-r2', role: 'engineering-reviewer' }); p.registerReviewer({ id: 'mr-rel', role: 'release-manager' })
  const a = p.createAuthority('mr-r1', { citation: '15 USC 1681', jurisdiction: 'US-CA', effectiveFrom: '2020-01-01', permittedUse: 'education', limitations: ['educational'] })
  const m = p.createEducationModule('mr-r1', { title: 'Balance timing', body: 'Bureaus update on different dates.', jurisdiction: 'US-CA', effectiveFrom: '2020-01-01', permittedUse: 'education', limitations: ['verify'] })
  p.reviewGovernance('authority', a.id, 'mr-r1', 'approved', 'measurement'); p.reviewGovernance('module', m.id, 'mr-r1', 'approved', 'measurement')
  const r = p.createRule('mr-r2', { name: 'cross-bureau-balance-difference', jurisdiction: 'US-CA', effectiveFrom: '2020-01-01', requiredInputs: ['balance'], minimumConfidence: 0.9, minimumMagnitude: 1000, classification: 'verification-recommended', limitations: ['different update dates can explain a difference'], authorityIds: [a.id], educationModuleIds: [m.id], testCases: ['measurement'] })
  p.reviewGovernance('rule', r.id, 'mr-r2', 'approved', 'measurement')
  return p.publishRuleset('mr-rel', 'US-CA', '2026-07-01')
}

function binOf(magCents: number): string {
  if (magCents < 1000) return '<$10'        // likely timing/noise
  if (magCents < 10000) return '$10-100'
  if (magCents < 100000) return '$100-1k'
  return '>$1k'                              // likely material
}

test('measurement: real-sample finding magnitude distribution (structure-only)', { skip: !hasBin }, () => {
  let totalFindings = 0; let checkedAny = false; const rows: string[] = []
  for (const path of PDFS) {
    if (!existsSync(path)) continue
    checkedAny = true
    const p = new CreditAnalysisPlatform()
    p.configureLaunchScope({
      mode: 'one-state-free-pilot',
      approvedStates: ['US-CA'],
      provisionalSelectedState: 'US-CA',
      stateSelectionEvidenceReference: 'docs/one-state-launch-selection-memo.md',
      availabilityClaim: 'Pilot currently limited to approved states only.',
      pricingMode: 'free-pilot-only',
      nationwideStatus: 'not-cleared',
      notes: 'Analysis-only, educational, consumer-uploaded, consumer-only boundary.',
    })
    const { sessionId } = p.register({ email: 'measure@example.com', password })
    const ws = p.recordConsent(sessionId, consent); p.acceptAuthorization(sessionId)
    const init = p.initializeUpload(sessionId, ws.id)
    const up = p.completeUpload({ uploadId: init.id, token: init.token, fileName: path.split('/').pop() ?? 'r.pdf', mediaType: 'application/pdf', bytes: readFileSync(path) })
    const report = p.parseReport(sessionId, up.id)
    p.completeReview(sessionId, report.id)
    const proposed = p.proposeMatches(sessionId, report.id)
    const confirmable = proposed.filter(mt => mt.tradelineIds.length <= 3)
    const withheldCollisionSets = proposed.length - confirmable.length
    for (const mt of confirmable) p.decideMatch(sessionId, mt.id, 'confirmed', 'measurement')
    const analysis = p.runAnalysis(sessionId, report.id, publishRules(p), 'US-CA')

    const bins: Record<string, number> = { '<$10': 0, '$10-100': 0, '$100-1k': 0, '>$1k': 0 }
    let downRanked = 0
    for (const f of analysis.findings) {
      assert.ok(f.evidence.length >= 2, 'a balance-difference finding must compare at least 2 bureaus')
      const vals = f.evidence.map(e => Number(e.value)).filter(n => Number.isFinite(n))
      assert.ok(vals.length >= 2, 'finding evidence must carry numeric balances')
      const mag = Math.max(...vals) - Math.min(...vals)
      bins[binOf(mag)] = (bins[binOf(mag)] ?? 0) + 1
      if (f.severity === 'low') downRanked += 1
    }
    totalFindings += analysis.findings.length
    rows.push(`  ${path.split('/').pop()?.padEnd(46)} tradelines=${String(report.tradelines.length).padStart(3)} matches=${String(proposed.length).padStart(3)} confirmed<=3=${String(confirmable.length).padStart(3)} withheld>3=${String(withheldCollisionSets).padStart(3)} findings=${String(analysis.findings.length).padStart(3)} down-ranked=${String(downRanked).padStart(3)} | <$10(timing)=${bins['<$10']} $10-100=${bins['$10-100']} $100-1k=${bins['$100-1k']} >$1k(material)=${bins['>$1k']}`)
  }
  if (!checkedAny) return // all files absent (gitignored) -> pass vacuously in CI
  console.log('  [real-sample measurement]\n' + rows.join('\n'))
  assert.ok(totalFindings > 0, 'expected at least one balance-difference finding across the real samples')
})
