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

export type ParserPaymentHistoryCell = ParserValue<string> & { yearMonth: string }

export type ParserTradeline = {
  id: string
  bureau: Bureau
  creditor: ParserValue<string>
  maskedAccount: string
  accountType: ParserValue<string>
  balance: ParserValue<number>
  creditLimit: ParserValue<number>
  pastDue: ParserValue<number>
  status: ParserValue<string>
  opened: ParserValue<string>
  updated: ParserValue<string>
  dateOfFirstDelinquency: ParserValue<string>
  paymentHistory: ParserPaymentHistoryCell[]
  remarks: ParserValue<string>[]
  specialCommentCodes: ParserValue<string>[]
}

export type ParserInquiry = {
  id: string
  bureau: Bureau
  creditor: ParserValue<string>
  businessType: ParserValue<string>
  date: ParserValue<string>
}

export type ParserScore = {
  bureau: Bureau
  score: ParserValue<number>
  scale: ParserValue<string>
}

/**
 * The report's own personal-information section, kept per bureau.
 *
 * Each bureau states these independently, and the differences between them are the signal: a name
 * or address one bureau holds and the others do not is the classic mixed-file indicator. Collapsing
 * them into one list would destroy exactly the comparison this section exists to support.
 */
export type ParserPersonalInformation = {
  names: ParserValue<string>[]
  alsoKnownAs: ParserValue<string>[]
  datesOfBirth: ParserValue<string>[]
  currentAddresses: ParserValue<string>[]
  previousAddresses: ParserValue<string>[]
  employers: ParserValue<string>[]
  /** Masked fragments as displayed (e.g. "XXX-XX-1234"). A full number is never extracted. */
  socialSecurityFragments: ParserValue<string>[]
}

export const emptyPersonalInformation = (): ParserPersonalInformation => ({
  names: [], alsoKnownAs: [], datesOfBirth: [], currentAddresses: [], previousAddresses: [], employers: [], socialSecurityFragments: [],
})

export type ParserReport = {
  provider: string
  template: string
  reportDate: string | null
  identity: ParserValue<string>[]
  personalInformation: ParserPersonalInformation
  tradelines: ParserTradeline[]
  inquiries: ParserInquiry[]
  scores: ParserScore[]
}
