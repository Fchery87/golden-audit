/**
 * Output trust-boundary guard (FCRA counsel conditions Q-L2 + Q-L4; ADR-0004; ticket 12).
 *
 * The inbound control (packages/redaction) strips identifiers before analysis.
 * This is the symmetric outbound control: any text that will leave the system to a
 * consumer — generated narration, exports, UI strings — must pass this guard, which
 * blocks (a) counsel's forbidden CROA/CCSA vocabulary (no implied credit-improvement
 * promises) and (b) any residual unredacted identifier. Fail-closed by throwing.
 */

import { containsUnredactedIdentifier } from '../../redaction/src/index.js'

export const FORBIDDEN_OUTPUT_TERMS = [
  'credit repair',
  'fix your credit',
  'fix credit',
  'clean your credit',
  'clean up your credit',
  'remove negative',
  'remove items',
  'delete negative',
  'boost your score',
  'improve your score',
  'get approved faster',
  'guarantee',
  'guaranteed',
] as const

export type OutputValidation = { ok: boolean; violations: string[] }

export function validateConsumerOutput(text: string): OutputValidation {
  const violations: string[] = []
  const lower = text.toLowerCase()
  for (const term of FORBIDDEN_OUTPUT_TERMS) if (lower.includes(term)) violations.push(`forbidden-term:${term}`)
  if (containsUnredactedIdentifier(text)) violations.push('unredacted-identifier')
  return { ok: violations.length === 0, violations }
}

/** Fail-closed boundary check. Call at every consumer-facing output path. */
export function assertSafeConsumerOutput(text: string): void {
  const { ok, violations } = validateConsumerOutput(text)
  if (!ok) throw new Error(`Output blocked at trust boundary: ${violations.join(', ')}`)
}
