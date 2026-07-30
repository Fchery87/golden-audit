export type AccessibilityEvidenceInput = {
  skipLink: boolean
  ariaLiveStatus: boolean
  focusVisibleStyles: boolean
  labeledInputs: boolean
  reducedMotionRespect: boolean
  readableExport: boolean
  keyboardPaths: boolean
}

export type AccessibilityEvidenceCoverage = {
  totalChecks: number
  passedChecks: number
  failedChecks: number
}

export type AccessibilityEvidenceReport = {
  passed: boolean
  missing: Array<keyof AccessibilityEvidenceInput>
  coverage: AccessibilityEvidenceCoverage
}

export function evaluateAccessibilityEvidence(input: AccessibilityEvidenceInput): AccessibilityEvidenceReport {
  const missing = Object.entries(input)
    .filter(([, passed]) => !passed)
    .map(([key]) => key as keyof AccessibilityEvidenceInput)
  const totalChecks = Object.keys(input).length
  const passedChecks = totalChecks - missing.length
  return {
    passed: missing.length === 0,
    missing,
    coverage: {
      totalChecks,
      passedChecks,
      failedChecks: missing.length,
    },
  }
}
