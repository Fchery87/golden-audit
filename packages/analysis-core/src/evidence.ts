/** Provenance + evidence types. Shared across the engine and any consumer of findings. */

export type SourceReference = { kind: 'page' | 'element'; locator: string; snippet: string }

export type EvidenceSubject = 'tradeline' | 'identity'

export type Evidence = {
  /**
   * Identifier of the entity this evidence points at. Named for the tradeline case because that
   * is what every account rule emits; identity rules put the identity value's own id here and set
   * `subject` so a reader can tell which kind of entity the id refers to without guessing from
   * the field name. Kept as-is rather than renamed because the name is load-bearing in stored
   * ConsumerReport snapshots that must stay readable.
   */
  tradelineId: string
  /** Defaults to 'tradeline' when absent, which is what every pre-identity finding is. */
  subject?: EvidenceSubject
  field: string
  value: string | number
  source: SourceReference
}
