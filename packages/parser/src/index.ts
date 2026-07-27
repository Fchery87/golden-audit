import { redactReportText } from '../../redaction/src/index.js'
import { detectFormat } from './detector.js'
import { parseStructuredHtml } from './html-adapter.js'
import type { ParserReport } from './types.js'

export type ParseResult = { report: ParserReport } | { unsupported: true; reason: string }

const adapters = new Map<string, (content: string) => ParserReport>()
adapters.set('structured-html', parseStructuredHtml)
// 'synthetic-fixture' is deliberately NOT registered here: this package does not honor
// the fictional JSON marker. The host keeps that as an explicitly-labeled test path.

/**
 * Parse raw report content. Applies inbound redaction BEFORE extraction (trust boundary),
 * detects the format, and dispatches to an adapter. Unknown formats are flagged
 * unsupported — never guessed.
 */
export function parseReportContent(rawContent: string): ParseResult {
  const detected = detectFormat(rawContent)
  if (typeof detected === 'object' && 'unsupported' in detected) return detected
  const adapter = adapters.get(detected)
  if (!adapter) return { unsupported: true, reason: `No adapter registered for format "${detected}"` }
  const { redacted } = redactReportText(rawContent)
  return { report: adapter(redacted) }
}

export { detectFormat } from './detector.js'
export { parseStructuredHtml } from './html-adapter.js'
export * from './types.js'
