export type ComprehensionEvidenceInput = {
  plainLanguageBoundary: boolean
  stateSelectionHelp: boolean
  educationalLimitations: boolean
  explanationOrientedCopy: boolean
  noScorePromise: boolean
  noDisputePromise: boolean
  readableTerminology: boolean
}

export type ComprehensionEvidenceCoverage = {
  totalChecks: number
  passedChecks: number
  failedChecks: number
}

export type ComprehensionEvidenceReport = {
  passed: boolean
  missing: Array<keyof ComprehensionEvidenceInput>
  coverage: ComprehensionEvidenceCoverage
}

export function evaluateComprehensionEvidence(input: ComprehensionEvidenceInput): ComprehensionEvidenceReport {
  const missing = Object.entries(input)
    .filter(([, passed]) => !passed)
    .map(([key]) => key as keyof ComprehensionEvidenceInput)
  const totalChecks = Object.keys(input).length
  return {
    passed: missing.length === 0,
    missing,
    coverage: {
      totalChecks,
      passedChecks: totalChecks - missing.length,
      failedChecks: missing.length,
    },
  }
}
