import type { CreditAnalysisPlatform, Jurisdiction } from '../../../packages/platform/src/index.js'

/**
 * Seeds the operator-config governance state (reviewers, authority, education module, rule,
 * published ruleset) that every request needs before analysis can run for a jurisdiction.
 *
 * This is idempotent per CreditAnalysisPlatform instance (governance lives in-memory,
 * re-seeded fresh per instantiation — see docs/consumer-workflow-implementation-plan.md D5).
 * It must be called once per platform instance before any consumer request touches
 * runAnalysis/kickoff-analysis for that jurisdiction.
 *
 * Previously this only ran in apps/web/src/server.ts (bootstrapPublishedRulesets, inline).
 * The Cloudflare Pages Functions path (apps/web/functions/api/_platform.ts) never called an
 * equivalent — resolveRulesetForJurisdiction always threw "No published ruleset is available"
 * there, meaning kickoff-analysis / complete-analysis were completely broken on the deployed
 * target. This function is now called from both paths so that bug is fixed rather than
 * inherited into Phase 1.
 */
export function bootstrapGovernance(platform: CreditAnalysisPlatform, jurisdiction: Jurisdiction = 'US-CA'): void {
  if (platform.hasPublishedRuleset(jurisdiction)) return

  platform.registerReviewer({ id: 'bootstrap-compliance-reviewer', role: 'compliance-reviewer' })
  platform.registerReviewer({ id: 'bootstrap-engineering-reviewer', role: 'engineering-reviewer' })
  platform.registerReviewer({ id: 'bootstrap-release-manager', role: 'release-manager' })

  const authority = platform.createAuthority('bootstrap-compliance-reviewer', {
    citation: '15 USC 1681',
    jurisdiction,
    effectiveFrom: '2020-01-01',
    permittedUse: 'education',
    limitations: ['A consumer report alone may not establish a legal violation'],
  })
  const module = platform.createEducationModule('bootstrap-compliance-reviewer', {
    title: 'Balance timing',
    body: 'Bureaus can update on different dates.',
    jurisdiction,
    effectiveFrom: '2020-01-01',
    permittedUse: 'education',
    limitations: ['Verify current information directly'],
  })
  platform.reviewGovernance('authority', authority.id, 'bootstrap-compliance-reviewer', 'approved', 'Prototype consumer flow seed content')
  platform.reviewGovernance('module', module.id, 'bootstrap-compliance-reviewer', 'approved', 'Prototype consumer flow seed content')

  const ruleDefinitions = [
    { name: 'cross-bureau-balance-difference', requiredInputs: ['balance', 'updated'], classification: 'verification-recommended' as const, limitations: ['Different update dates can explain a difference'], testCases: ['pilot-bootstrap-balance'] },
    { name: 'cross-bureau-credit-limit-difference', requiredInputs: ['creditLimit'], classification: 'verification-recommended' as const, limitations: ['A report may show high credit rather than a current credit limit'], testCases: ['pilot-bootstrap-credit-limit'] },
    { name: 'cross-bureau-past-due-difference', requiredInputs: ['pastDue'], classification: 'verification-recommended' as const, limitations: ['Different update dates can explain a difference'], testCases: ['pilot-bootstrap-past-due'] },
    { name: 'cross-bureau-status-difference', requiredInputs: ['status'], classification: 'verification-recommended' as const, limitations: ['Account status can update on different dates'], testCases: ['pilot-bootstrap-status'] },
    { name: 'cross-bureau-date-opened-difference', requiredInputs: ['opened'], classification: 'verification-recommended' as const, limitations: ['Verify the date with creditor records'], testCases: ['pilot-bootstrap-opened'] },
    { name: 'cross-bureau-last-reported-difference', requiredInputs: ['updated'], classification: 'observed-fact' as const, limitations: ['Different reporting cycles are common'], testCases: ['pilot-bootstrap-updated'] },
    { name: 'closed-or-paid-with-balance', requiredInputs: ['status', 'balance'], classification: 'verification-recommended' as const, limitations: ['Status and balance can be reported on different cycles'], testCases: ['pilot-bootstrap-closed-balance'] },
    { name: 'past-due-exceeds-balance', requiredInputs: ['pastDue', 'balance'], classification: 'verification-recommended' as const, limitations: ['Fields can be reported on different cycles'], testCases: ['pilot-bootstrap-past-due-balance'] },
    { name: 'revolving-without-credit-limit', requiredInputs: ['accountType', 'creditLimit'], classification: 'observed-fact' as const, limitations: ['Some furnishers report high credit rather than a current limit'], testCases: ['pilot-bootstrap-revolving-limit'] },
    { name: 'duplicate-tradeline-within-bureau', requiredInputs: ['maskedAccount'], classification: 'verification-recommended' as const, limitations: ['Separate accounts can share similar identifying details'], testCases: ['pilot-bootstrap-duplicate'] },
    { name: 'partial-furnishing-observation', requiredInputs: ['maskedAccount'], classification: 'observed-fact' as const, limitations: ['Not every account is expected to appear on all three bureaus'], testCases: ['pilot-bootstrap-partial-furnishing'] },
  ]
  for (const definition of ruleDefinitions) {
    const rule = platform.createRule('bootstrap-engineering-reviewer', {
      ...definition,
      jurisdiction,
      effectiveFrom: '2020-01-01',
      minimumConfidence: 0.9,
      authorityIds: [authority.id],
      educationModuleIds: [module.id],
    })
    platform.reviewGovernance('rule', rule.id, 'bootstrap-engineering-reviewer', 'approved', 'Prototype consumer flow seed content')
  }

  platform.publishRuleset('bootstrap-release-manager', jurisdiction, '2026-07-01')
}
