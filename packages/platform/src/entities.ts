import type { Finding, FindingClassification, RuleAudit, SourceReference, Analysis as CoreAnalysis } from '../../analysis-core/src/index.js'

export type { Finding, FindingClassification, RuleAudit, SourceReference }
export type Id = string
export type Jurisdiction = `US-${string}`
export type Bureau = 'equifax' | 'experian' | 'transunion'
export type LaunchScopeMode = 'one-state-free-pilot' | 'small-reviewed-state-subset' | 'launch-paused-pending-review'
export type NationwideStatus = 'not-cleared' | 'goal-only' | 'state-by-state-review' | 'paused-pending-review'
export type ReviewDecision = 'confirmed' | 'corrected' | 'unknown' | 'not-shown'

export type Consent = {
  version: string
  acceptedAt: string
  adultUSConsumer: true
  authorizedReportUse: true
  educationalLimitations: true
  sensitiveDataHandling: true
  residence: Jurisdiction
  analysisJurisdiction: Jurisdiction
}

export type AuthorizationRecord = { id: Id; userId: Id; version: string; acceptedAt: string }

export type LaunchScope = {
  mode: LaunchScopeMode
  approvedStates: Jurisdiction[]
  provisionalSelectedState?: Jurisdiction
  stateSelectionEvidenceReference: string
  availabilityClaim: string
  pricingMode: 'free-pilot-only'
  nationwideStatus: NationwideStatus
  notes: string
  configuredAt: string
}

export type User = { id: Id; email: string; passwordHash: string; passwordSalt: string; consent?: Consent; emailVerifiedAt?: string }
export type Session = { id: Id; userId: Id; revokedAt?: string; createdAt: string; expiresAt: string; lastUsedAt: string }
export type Workspace = { id: Id; userId: Id; createdAt: string }

export type UploadStage = 'initialized' | 'scanning' | 'quarantined' | 'ready-to-parse' | 'retryable-failure' | 'final-failure'
export type Upload = {
  id: Id
  userId: Id
  workspaceId: Id
  token: string
  tokenExpiresAt: string
  fileName?: string
  mediaType?: 'application/pdf' | 'text/html'
  size?: number
  sourceHash?: string
  scanResult?: 'clean' | 'unsafe'
  retentionClass?: 'consumer-report'
  stage: UploadStage
  sanitizedContent?: string
  redactionCount?: number
  failureMessage?: string
  completedAt?: string
}

export type CanonicalValue<T> = {
  id: Id
  bureau: Bureau
  field: string
  normalized: T | null
  originalDisplay: string
  state: 'known' | 'unknown' | 'blank' | 'not-applicable' | 'parser-failed'
  source: SourceReference
  extractionMethod: 'native-text' | 'html-selector'
  parserVersion: string
  confidence: number
  datePrecision?: 'day' | 'month' | 'year'
  currency?: 'USD'
  review?: { decision: ReviewDecision; reason: string; actorId: Id; at: string; replacement?: T }
}

export type Tradeline = {
  id: Id
  creditor: CanonicalValue<string>
  maskedAccount: CanonicalValue<string>
  accountType: CanonicalValue<string>
  balance: CanonicalValue<number>
  creditLimit: CanonicalValue<number>
  pastDue: CanonicalValue<number>
  status: CanonicalValue<string>
  opened: CanonicalValue<string>
  updated: CanonicalValue<string>
  dateOfFirstDelinquency: CanonicalValue<string>
  paymentHistory: Array<CanonicalValue<string> & { yearMonth: string }>
  remarks: CanonicalValue<string>[]
  specialCommentCodes: CanonicalValue<string>[]
}

export type CanonicalReport = {
  id: Id
  userId: Id
  uploadId: Id
  provider: string
  template: string
  parserVersion: string
  normalizedVersion: number
  reportDate: string
  identity: CanonicalValue<string>[]
  addresses: CanonicalValue<string>[]
  employers: CanonicalValue<string>[]
  tradelines: Tradeline[]
  collections: Tradeline[]
  inquiries: CanonicalValue<string>[]
  publicRecords: CanonicalValue<string>[]
  scores: CanonicalValue<number>[]
  remarks: CanonicalValue<string>[]
  reviewComplete: boolean
}

export type GovernanceStatus = 'draft' | 'approved' | 'rejected' | 'published' | 'disabled'
export type GovernanceHistory = { action: GovernanceStatus | 'revision-requested'; reviewerId: Id; at: string; reason: string }
export type Authority = { id: Id; title?: string; citation: string; sourceUrl?: string; jurisdiction: Jurisdiction; effectiveFrom: string; permittedUse: string; limitations: string[]; status: GovernanceStatus; history: GovernanceHistory[] }
export type EducationModuleKind = 'section-primer' | 'finding-module'
export type EducationModule = { id: Id; kind?: EducationModuleKind; section?: 'tradelines' | 'balances' | 'status' | 'inquiries' | 'finding'; title: string; body: string; authorityIds?: Id[]; jurisdiction: Jurisdiction; effectiveFrom: string; permittedUse: string; limitations: string[]; status: GovernanceStatus; history: GovernanceHistory[] }
export type ReviewerRole = 'compliance-reviewer' | 'engineering-reviewer' | 'release-manager'
export type Reviewer = { id: Id; role: ReviewerRole }
export type ReviewedGovernanceCatalog = {
  catalogVersion: string
  jurisdiction: Jurisdiction
  approval: { approvedByGitIdentity: string; approvedByEmail: string; approvedAt: string; reReviewDueAt: string; reviewIntervalDays: number; catalogSha256: string; reviewedCommit: string }
  authorities: Authority[]
  modules: EducationModule[]
  rules: Array<Rule & { id: Id }>
}
export type Rule = {
  id: Id
  name: string
  jurisdiction: Jurisdiction
  effectiveFrom: string
  requiredInputs: string[]
  minimumConfidence: number
  minimumMagnitude?: number
  classification: FindingClassification
  limitations: string[]
  authorityIds: Id[]
  educationModuleIds: Id[]
  testCases: string[]
  status: GovernanceStatus
  history: GovernanceHistory[]
  version?: string
}

export type MatchGroup = {
  id: Id
  reportId: Id
  tradelineIds: Id[]
  confidence: number
  signals: string[]
  state: 'proposed' | 'confirmed' | 'rejected' | 'split' | 'merged'
  history: Array<{ action: MatchGroup['state']; actorId: Id; at: string; reason: string }>
}

export type Analysis = CoreAnalysis & { userId: Id; reportId: Id }

export type ActionItem = { id: Id; findingId: Id; status: 'unresolved' | 'recognized' | 'dismissed' | 'under-review' | 'complete'; note?: string; reason?: string; documents: string[] }
export type ReportFinding = Finding & { educationModules: EducationModule[]; authorities: Authority[] }
export type ReportPrimer = EducationModule & { authorities: Authority[] }
export type CoverageRow = { ruleId: Id; name: string; requiredInputs: string[]; outcomes: RuleAudit[] }
export type ParserFieldAvailability = { field: string; capability: 'supported' | 'planned'; states: Record<CanonicalValue<unknown>['state'], number> }
export type ReportContent = { catalogVersion: string; rulesetVersion: string; parserVersion: string; sectionPrimers: ReportPrimer[]; coverage: CoverageRow[]; parserFields: ParserFieldAvailability[] }
export type ConsumerReport = { id: Id; userId: Id; analysisId: Id; limitations: string[]; overview: Record<string, number>; findings: ReportFinding[]; actions: ActionItem[]; content?: ReportContent; generatedAt: string }
export type ExportArtifact = { id: Id; userId: Id; reportId: Id; formatVersion?: string; content: string; createdAt: string }
export type DeletionJob = { id: Id; userId: Id; status: 'pending-provider' | 'complete'; deleted: string[]; delayed: string[]; completedAt?: string }
/** Purpose-limited operational proof of completed deletion. It must never carry an account, user, session, report, or artifact identifier. */
export type DeletionReceipt = { id: Id; completedAt: string; outcome: 'account-deleted' }
export type AuditEvent = { type: string; actorId: Id; subjectId: Id; at: string; metadata: Record<string, string> }

export type PilotApprovalArea = 'product' | 'legal' | 'privacy' | 'security' | 'operations' | 'accessibility' | 'vendor'
export type PilotApproval = { area: PilotApprovalArea; approver: string; evidenceReference: string; approvedAt: string }
export type PilotGate = { ready: boolean; missing: PilotApprovalArea[]; approvals: PilotApproval[]; launchScope?: LaunchScope; missingLaunchScope: boolean }
export type PilotDrillResult = 'passed' | 'passed-with-gaps' | 'blocked'
export type PilotDrill = { id: Id; scenario: string; owner: string; result: PilotDrillResult; gaps: string[]; followUpTicket: string; recordedAt: string }
export type PilotDrillEvidenceGap = {
  scenario: string
  owner: string
  result: Extract<PilotDrillResult, 'passed-with-gaps' | 'blocked'>
  gaps: string[]
  followUpTicket: string
}
export type PilotDrillEvidenceReport = {
  generatedAt: string
  totalDrills: number
  outcomes: Record<PilotDrillResult, number>
  openGaps: PilotDrillEvidenceGap[]
  followUpTickets: string[]
}
export type PilotEvidenceSummary = {
  openApprovalAreas: PilotApprovalArea[]
  failingEvidenceSurfaces: Array<'comprehension' | 'accessibility' | 'narration' | 'drills'>
}
export type PilotApprovalRecordFile = {
  _warning?: string
  scope: string
  status: string
  productionLaunch?: string
  launchScope?: {
    mode: LaunchScopeMode
    approvedStates: string[]
    provisionalSelectedState?: string
    stateSelectionEvidenceReference: string
    availabilityClaim: string
    pricingMode: 'free-pilot-only'
    nationwideStatus: NationwideStatus
    notes: string
  }
  approvals: Array<{ area: PilotApprovalArea; approver: string; evidenceReference: string }>
}
export type QualityLatencySummary = { sampleSize: number; averageMs: number; maxMs: number }
export type QualityFindingSummary = {
  total: number
  averagePerAnalysis: number
  bySeverity: Record<'low' | 'medium' | 'high', number>
  byClassification: Record<FindingClassification, number>
}
export type QualityMatchingSummary = {
  proposedGroups: number
  confirmedGroups: number
  highConfidenceProposals: number
  splitGroups: number
}
export type QualityParserSummary = {
  reportsWithTradelines: number
  averageTradelinesPerReport: number
}
export type QualityReportSegment = {
  provider: string
  documentType: 'pdf' | 'html'
  jurisdiction: Jurisdiction
  uploads: number
  parsedReports: number
  analyses: number
  findings: QualityFindingSummary
  matching: QualityMatchingSummary
  parser: QualityParserSummary
  latency: {
    uploadToParse: QualityLatencySummary
    parseToAnalysis: QualityLatencySummary
  }
}
export type QualityReport = {
  generatedAt: string
  segments: QualityReportSegment[]
}
