/** Provenance + evidence types. Shared across the engine and any consumer of findings. */

export type SourceReference = { kind: 'page' | 'element'; locator: string; snippet: string }

export type Evidence = {
  tradelineId: string
  field: string
  value: string | number
  source: SourceReference
}
