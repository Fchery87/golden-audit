/**
 * Output trust-boundary guard (FCRA counsel conditions Q-L2 + Q-L4 + Q-L5; ADR-0004; ticket 12).
 *
 * The inbound control (packages/redaction) strips identifiers before analysis.
 * This is the symmetric outbound control: any text that will leave the system to a
 * consumer — generated narration, exports, UI strings — must pass this guard, which blocks
 * (a) counsel's forbidden CROA/CCSA credit-improvement vocabulary (no implied promises),
 * (b) dispute-generation language (no communication to bureaus/furnishers on the consumer's behalf),
 * (c) unauthorized-practice-of-law conclusions (no statute applied to the consumer's facts), and
 * (d) any residual unredacted identifier. Fail-closed by throwing.
 */

import { containsUnredactedIdentifier } from '../../redaction/src/index.js'

/** CROA / California Credit Services Act — no implied credit-improvement promises (Q-L2). */
export const FORBIDDEN_OUTPUT_TERMS = [
  'credit repair',
  'fix your credit',
  'fix credit',
  'clean your credit',
  'clean up your credit',
  'clean up your report',
  'remove negative',
  'remove items',
  'delete negative',
  'erase negative',
  'boost your score',
  'improve your score',
  'get approved faster',
  'guarantee',
  'guaranteed',
] as const

/** No generation/transmission of disputes to bureaus/furnishers (Q-L2). */
export const FORBIDDEN_DISPUTE_TERMS = [
  'dispute letter',
  'file a dispute',
  'send a dispute',
  'dispute this item',
  'dispute this account',
  'we will dispute',
  'we can dispute',
  'contact the bureau',
  'contact the furnisher',
] as const

/** Unauthorized-practice-of-law boundary — no legal conclusions applied to the consumer's facts (Q-L5). */
export const FORBIDDEN_UPL_TERMS = [
  'violated the fcra',
  'violated the fair credit reporting',
  'fcra violation',
  'legal violation',
  'broke the law',
  'you have a legal claim',
  'you have a claim',
  'you may have a claim',
  'legal claim',
  'legally invalid',
  'legally unenforceable',
  'legally void',
  'entitled to deletion',
  'entitled to damages',
  'entitled to compensation',
  'sue the bureau',
  'sue the furnisher',
  'file a lawsuit',
  'bring a lawsuit',
  'statute of limitations has run',
  'statute of limitations expired',
  'past the statute of limitations',
] as const

export type OutputValidation = { ok: boolean; violations: string[] }

export function validateConsumerOutput(text: string): OutputValidation {
  const violations: string[] = []
  const lower = text.toLowerCase()
  for (const term of FORBIDDEN_OUTPUT_TERMS) if (lower.includes(term)) violations.push(`forbidden-term:${term}`)
  for (const term of FORBIDDEN_DISPUTE_TERMS) if (lower.includes(term)) violations.push(`dispute-term:${term}`)
  for (const term of FORBIDDEN_UPL_TERMS) if (lower.includes(term)) violations.push(`upl-term:${term}`)
  if (containsUnredactedIdentifier(text)) violations.push('unredacted-identifier')
  return { ok: violations.length === 0, violations }
}

/** Fail-closed boundary check. Call at every consumer-facing output path. */
export function assertSafeConsumerOutput(text: string): void {
  const { ok, violations } = validateConsumerOutput(text)
  if (!ok) throw new Error(`Output blocked at trust boundary: ${violations.join(', ')}`)
}
