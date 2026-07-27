// PROVISIONAL FINDING TAXONOMY — pending legal review.
// See docs/legal-pre-mortem-brief.md (Q-L2) and ADR-0002. An FCRA attorney may
// narrow or relabel these classifications. This module is deliberately isolated
// so the taxonomy can change without touching the engine or the rest of the app.

export const FINDING_CLASSIFICATIONS = [
  'observed-fact',
  'inconsistency',
  'potential-error',
  'verification-recommended',
  'potential-compliance-concern',
  'insufficient-information',
  'educational-opportunity',
] as const

export type FindingClassification = (typeof FINDING_CLASSIFICATIONS)[number]

export type Severity = 'low' | 'medium' | 'high'

export const SEVERITY_RANK: Record<Severity, number> = { low: 1, medium: 2, high: 3 }

/** Exhaustiveness check so adding a classification forces every switch to be updated. */
export function assertExhaustiveClassification(value: never): never {
  throw new Error(`Unhandled FindingClassification: ${String(value)}`)
}
