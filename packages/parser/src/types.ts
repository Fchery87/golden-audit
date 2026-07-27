import type { SourceReference } from '../../analysis-core/src/index.js'

export type Bureau = 'equifax' | 'experian' | 'transunion' | 'unknown'

export type MissingState = 'known' | 'unknown' | 'low-confidence'

/**
 * A parsed value carrying provenance + calibrated confidence. Structurally compatible
 * with analysis-core's EvaluableTradeline balance slot so parser output feeds the
 * deterministic engine directly.
 */
export type ParserValue<T> = {
  bureau: Bureau
  field: string
  normalized: T | null
  originalDisplay: string
  state: MissingState
  confidence: number
  source: SourceReference
}

export type ParserTradeline = {
  id: string
  bureau: Bureau
  creditor: string
  maskedAccount: string
  balance: ParserValue<number>
  status: ParserValue<string>
  opened: ParserValue<string>
  updated: ParserValue<string>
}

export type ParserReport = {
  provider: string
  template: string
  reportDate: string | null
  tradelines: ParserTradeline[]
}
