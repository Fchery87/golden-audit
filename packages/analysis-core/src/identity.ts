import type { Evidence, SourceReference } from './evidence.js'

/**
 * Identity comparison primitives.
 *
 * Every check in this file compares the report's own personal-information section against a
 * reference set the *consumer* supplied and attested to. That direction matters: a report
 * compared only with itself can never show that the name on it is not the reader's name, which
 * is why this whole check category is impossible without an intake step. It is also why the
 * attestation is a precondition rather than a formality — the comparison is only as defensible
 * as the reference value.
 *
 * These are the strongest available mixed-file signals (someone else's records merged into your
 * file). They remain Observations and verification recommendations: a difference here is a
 * question to take to the bureau with documents, never a conclusion that anything is wrong.
 */

export type EvaluableIdentityValue = {
  id: string
  bureau?: string
  field: string
  normalized: string | null
  originalDisplay?: string
  confidence: number
  source: SourceReference
}

/** Reference identity, already normalized by the host. `addressKeys` are comparison keys, not
 *  display strings — see normalizeAddressForComparison in the parser package. */
export type AttestedIdentity = {
  fullName: string
  dateOfBirth: string
  ssnLastFour: string
  addressKeys: string[]
}

export type ReportedIdentity = {
  names: EvaluableIdentityValue[]
  datesOfBirth: EvaluableIdentityValue[]
  ssnFragments: EvaluableIdentityValue[]
  addresses: Array<EvaluableIdentityValue & { comparisonKey: string }>
}

const NAME_SUFFIXES = new Set(['JR', 'SR', 'II', 'III', 'IV', 'V', 'MD', 'PHD', 'ESQ'])

/** Given + family tokens with punctuation, suffixes, and single-letter initials removed. */
export function nameComparisonTokens(value: string): { first: string; last: string } | null {
  const tokens = value
    .toUpperCase()
    .replace(/[.,]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .filter(token => !NAME_SUFFIXES.has(token))
  if (tokens.length < 2) return null
  const first = tokens[0]
  const last = tokens[tokens.length - 1]
  if (!first || !last) return null
  return { first, last }
}

/**
 * True when two displayed names plausibly denote the same person.
 *
 * Only the given and family names are compared. A dropped or abbreviated middle name is ordinary
 * furnishing variance present on most reports — treating it as a difference would bury the real
 * signal (a different surname or given name) under a finding on nearly every file.
 */
export function namesAgree(attested: string, reported: string): boolean {
  const left = nameComparisonTokens(attested)
  const right = nameComparisonTokens(reported)
  if (!left || !right) return true // Not comparable — the caller suppresses rather than guesses.
  return left.first === right.first && left.last === right.last
}

/**
 * True when a reported date of birth is consistent with the attested one at the precision the
 * report actually states. A report showing only `1985` is compared only as a year; padding it to
 * a full date would manufacture a difference the document never claimed.
 */
export function datesOfBirthAgree(attested: string, reported: string): boolean {
  if (!attested || !reported) return true
  const shorter = reported.length <= attested.length ? reported : attested
  const longer = reported.length <= attested.length ? attested : reported
  return longer.startsWith(shorter)
}

export function identityEvidence(value: EvaluableIdentityValue, display?: string): Evidence {
  return {
    tradelineId: value.id,
    subject: 'identity',
    field: value.field,
    value: display ?? value.originalDisplay ?? value.normalized ?? '',
    source: value.source,
  }
}

/** Comparable = present, readable, and at or above the rule's publishable confidence floor. */
export function comparableIdentityValues(values: EvaluableIdentityValue[], minimumConfidence: number): EvaluableIdentityValue[] {
  return values.filter(value => value.normalized !== null && value.normalized !== '' && value.confidence >= minimumConfidence)
}
