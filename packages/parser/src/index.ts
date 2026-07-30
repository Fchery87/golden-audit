import { redactReportText, containsUnredactedIdentifier } from '../../redaction/src/index.js'
import { detectFormat } from './detector.js'
import { parseStructuredHtml } from './html-adapter.js'
import { parseBboxHtml } from './bbox-extractor.js'
import { parseIdentityIqPdf } from './identityiq-pdf-adapter.js'
import type { ParserReport } from './types.js'

export type ParserFieldObservation = { label: string; expected?: unknown; actual?: unknown }
export type ParserFieldObservationOutcome = 'match' | 'missing' | 'unexpected'
export type ParserFieldObservationResult = ParserFieldObservation & { outcome: ParserFieldObservationOutcome }
export type ParserFieldEvaluation = { observations: number; matched: number; missing: number; unexpected: number; precision: number; recall: number; byLabel: ParserFieldObservationResult[] }
import type { Word } from './positional-types.js'

export type ParseResult = { report: ParserReport } | { unsupported: true; reason: string }

const adapters = new Map<string, (content: string) => ParserReport>()
adapters.set('structured-html', parseStructuredHtml)
// 'synthetic-fixture' is deliberately NOT registered here: this package does not honor
// the fictional JSON marker. The host keeps that as an explicitly-labeled test path.

/**
 * Parse raw (HTML) report content. Applies inbound redaction BEFORE extraction
 * (trust boundary), detects the format, and dispatchs to an adapter.
 * Unknown formats are flagged unsupported — never guessed.
 */
export function parseReportContent(rawContent: string): ParseResult {
  const detected = detectFormat(rawContent)
  if (typeof detected === 'object' && 'unsupported' in detected) return detected
  const adapter = adapters.get(detected)
  if (!adapter) return { unsupported: true, reason: `No adapter registered for format "${detected}"` }
  const { redacted } = redactReportText(rawContent)
  return { report: adapter(redacted) }
}


export function evaluateParserFields(observations: ParserFieldObservation[]): ParserFieldEvaluation {
  let matched = 0
  let missing = 0
  let unexpected = 0
  const byLabel = observations.map(observation => {
    let outcome: ParserFieldObservationOutcome
    if (observation.expected === undefined && observation.actual !== undefined) {
      unexpected += 1
      outcome = 'unexpected'
    } else if (observation.expected !== undefined && observation.actual === undefined) {
      missing += 1
      outcome = 'missing'
    } else if (Object.is(observation.expected, observation.actual)) {
      matched += 1
      outcome = 'match'
    } else {
      unexpected += 1
      outcome = 'unexpected'
    }
    return { ...observation, outcome }
  })
  const totalExpected = observations.filter(observation => observation.expected !== undefined).length
  const totalActual = observations.filter(observation => observation.actual !== undefined).length
  return {
    observations: observations.length,
    matched,
    missing,
    unexpected,
    precision: totalActual === 0 ? 1 : matched / totalActual,
    recall: totalExpected === 0 ? 1 : matched / totalExpected,
    byLabel,
  }
}

/** Inbound trust boundary for the PDF path: strip identifier-bearing words before analysis. */
export function redactWords(words: Word[]): Word[] {
  return words.map(w => (containsUnredactedIdentifier(w.text) ? { ...w, text: '[REDACTED]' } : w))
}

/** IdentityIQ PDF entry point: poppler -bbox HTML → positional words → redact → adapter. */
export function parseIdentityIqPdfBbox(bboxHtml: string): ParserReport {
  return parseIdentityIqPdf(redactWords(parseBboxHtml(bboxHtml)))
}

export { detectFormat } from './detector.js'
export { parseStructuredHtml } from './html-adapter.js'
export { parseBboxHtml } from './bbox-extractor.js'
export { parseIdentityIqPdf } from './identityiq-pdf-adapter.js'
export { BUREAU_BANDS, CREDITOR_X_MAX, bureauForX, detectBureauColumns, nearestBureau, xCenter } from './positional-types.js'
export type { Word, BureauColumn } from './positional-types.js'
export * from './types.js'
