/**
 * Trust-boundary redaction — a security hardening control (FCRA counsel condition
 * Q-L4; ADR-0004; ticket 12).
 *
 * Applied to raw report text BEFORE parsing/analysis, so the analysis layer,
 * findings, audit events, and telemetry never receive full SSNs or credentials.
 * This is defense-in-depth minimization-at-the-boundary: even if downstream code
 * or logging leaks, the sensitive identifier has already been removed.
 *
 * This is NOT a substitute for encryption-at-rest, MFA, least-privilege, or vendor
 * controls — those GLBA Safeguards items live in ADR-0004 / ticket 12 and require
 * real infrastructure. This module is the one minimization control that is
 * implementable and testable in the current prototype.
 */

export type RedactionResult = { redacted: string; redactions: number }

const ID_PATTERNS: ReadonlyArray<RegExp> = [
  /\b\d{3}-\d{2}-\d{4}\b/g, // SSN with dashes
  /\b\d{9}\b/g, // bare 9-digit identifier run
  /\b(?:password|passwd|pin|cvv|cvc|access\s+code|security\s+code)\b\s*[:=]\s*\S+/gi, // credential markers
]

export function redactReportText(raw: string): RedactionResult {
  let redactions = 0
  let out = raw
  for (const pattern of ID_PATTERNS) {
    out = out.replace(pattern, () => {
      redactions += 1
      return '[REDACTED]'
    })
  }
  return { redacted: out, redactions }
}

/** Boundary guard: true if any sensitive identifier pattern remains. Non-global, stateless. */
export function containsUnredactedIdentifier(text: string): boolean {
  return (
    /\b\d{3}-\d{2}-\d{4}\b/.test(text) ||
    /\b\d{9}\b/.test(text) ||
    /\b(?:password|passwd|pin|cvv|cvc|access\s+code|security\s+code)\b\s*[:=]\s*\S+/i.test(text)
  )
}
