/**
 * Format detection — the safety-critical "reject rather than guess" behavior
 * (counsel / spec user story 28). The detector recognizes a SMALL, explicit set of
 * signatures and flags everything else as unsupported. It never fabricates data for
 * an unknown layout.
 *
 * Currently recognized:
 *   - 'synthetic-fixture': the host's labeled test-fixture JSON marker (detected here
 *     only so the host can route it; this package does not honor it).
 *   - 'structured-html': the fictitious educational HTML fixture signature
 *     (`data-cp="tradelines"`). Real bureau HTML/PDF signatures are added ONLY when an
 *     authorized real-format fixture exists — until then they are flagged unsupported.
 */
export type DetectedFormat = 'synthetic-fixture' | 'structured-html' | { unsupported: true; reason: string }

export function detectFormat(content: string): DetectedFormat {
  if (content.includes('GOLDEN-AUDIT-REPORT:')) return 'synthetic-fixture'
  if (/<section[^>]*data-cp=["']tradelines["']/i.test(content)) return 'structured-html'
  return { unsupported: true, reason: 'No supported provider/template signature found; rejecting rather than guessing' }
}
