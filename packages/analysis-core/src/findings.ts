import type { FindingClassification, Severity } from './taxonomy.js'
import type { Evidence, SourceReference } from './evidence.js'

export type Finding = {
  id: string
  classification: FindingClassification
  title: string
  severity: Severity
  confidence: number
  evidence: Evidence[]
  limitations: string[]
  alternativeExplanations: string[]
  verificationDocuments: string[]
  authorityIds: string[]
  educationModuleIds: string[]
  suggestedAction: string
}

export type RuleAuditOutcome = 'triggered' | 'skipped' | 'suppressed'

export type RuleAudit = { ruleId: string; outcome: RuleAuditOutcome; reason: string }

export type AnalysisVersions = {
  normalizedInput: number
  ruleset: string
  jurisdiction: string
  parser: string
  application: string
}

/** Pure analysis output. Deliberately has NO userId/reportId — those are ingestion
 *  concerns and belong to the host application, not the ingest-agnostic core (ADR-0002). */
export type Analysis = {
  id: string
  findings: Finding[]
  audit: RuleAudit[]
  versions: AnalysisVersions
  createdAt: string
}

export type { Evidence, SourceReference, FindingClassification, Severity }
