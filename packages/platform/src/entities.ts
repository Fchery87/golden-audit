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

export type PostalAddress = { line1: string; line2?: string; city: string; state: string; postalCode: string }

/**
 * Consumer-attested identity captured at intake.
 *
 * This is the reference set the report's own personal-information section is compared against.
 * Without it the identity check category cannot run at all: a report can only be compared with
 * itself, so "the name on this report is not your name" is unprovable from report data alone.
 * The attestation is what makes an identity variance Finding defensible — the consumer, not the
 * parser, supplied the value being compared.
 */
export type ConsumerIdentity = {
  userId: Id
  fullName: string
  dateOfBirth: string
  /** Last four digits only. The full number is never collected, transmitted, or stored. */
  ssnLastFour: string
  currentAddress: PostalAddress
  previousAddresses: PostalAddress[]
  attestationVersion: string
  attestedAt: string
}

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
export type Session = { id: Id; userId: Id; csrfToken: string; revokedAt?: string; createdAt: string; expiresAt: string; lastUsedAt: string }
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

export type Inquiry = { id: Id; bureau: Bureau; creditor: CanonicalValue<string>; businessType: CanonicalValue<string>; date: CanonicalValue<string> }

export type CanonicalScore = CanonicalValue<number> & { scale: CanonicalValue<string> }

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
  inquiries: Inquiry[]
  publicRecords: CanonicalValue<string>[]
  scores: CanonicalScore[]
  remarks: CanonicalValue<string>[]
  reviewComplete: boolean
  reviewCompletedAt?: string
}

export type ConsumerReviewValue = { id: Id; bureau: Bureau; field: string; normalized: string | number | null; originalDisplay: string; state: CanonicalValue<unknown>['state']; source: Pick<SourceReference, 'kind' | 'locator'>; confidence: number; review?: CanonicalValue<unknown>['review'] }
/**
 * Optional, post-analysis correction surface for the values this parser is least sure about.
 *
 * `values` holds only extraction exceptions — values the parser failed on, or read below the
 * publishable confidence threshold. Confidently-read values are never listed: asking a consumer
 * to re-transcribe what the parser already read correctly is the parser's QA work, not theirs,
 * and a confirmation collected that way would launder parser error into attested data.
 * Nothing here gates analysis; `required` is an upper bound on what a consumer *may* correct.
 */
export type ConsumerValueReview = { reportId: Id; required: number; decided: number; complete: boolean; values: ConsumerReviewValue[] }

export type GovernanceStatus = 'draft' | 'approved' | 'rejected' | 'published' | 'disabled'
export type GovernanceHistory = { action: GovernanceStatus | 'revision-requested'; reviewerId: Id; at: string; reason: string }
export type Authority = { id: Id; title?: string; citation: string; sourceUrl?: string; jurisdiction: Jurisdiction; effectiveFrom: string; permittedUse: string; limitations: string[]; status: GovernanceStatus; history: GovernanceHistory[] }
export type EducationModuleKind = 'section-primer' | 'finding-module'
export type EducationModule = { id: Id; kind?: EducationModuleKind; section?: 'tradelines' | 'balances' | 'status' | 'inquiries' | 'personal-information' | 'finding'; title: string; body: string; authorityIds?: Id[]; jurisdiction: Jurisdiction; effectiveFrom: string; permittedUse: string; limitations: string[]; status: GovernanceStatus; history: GovernanceHistory[] }
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
export type ReportAccountCell = { label: string; value: string; source: Pick<SourceReference, 'kind' | 'locator'> }
export type ReportAccountRow = { id: Id; bureau: Bureau; cells: ReportAccountCell[] }
export type ReportScoreRow = { bureau: Bureau; score: number; scoreScale: string; source: Pick<SourceReference, 'kind' | 'locator'>; scaleSource: Pick<SourceReference, 'kind' | 'locator'> }
export type ReportInquiryRow = { id: Id; bureau: Bureau; creditor: string; businessType?: string; date: string; source: Pick<SourceReference, 'kind' | 'locator'> }

/**
 * Top-of-report audit summary — the "what did you find" layer every comparable platform leads
 * with. Every number here is a count of what this reading actually read; none of it is a score
 * prediction, a projection, or a judgment that any entry is wrong.
 */
export type ReportNegativeItemSummary = {
  total: number
  collections: number
  pastDueAccounts: number
  derogatoryStatusAccounts: number
  /** Accounts whose status this parser could not read — excluded from the counts above rather than assumed clean. */
  statusUnavailable: number
}
export type ReportUtilizationSummary = {
  revolvingBalanceCents: number
  revolvingLimitCents: number
  /** null when no revolving account carried both a balance and a limit this parser could read. */
  ratio: number | null
  accountsCounted: number
  accountsWithoutLimit: number
}
export type ReportSummary = {
  accountsRead: number
  accountsByBureau: Partial<Record<Bureau, number>>
  openAccounts: number
  closedAccounts: number
  negativeItems: ReportNegativeItemSummary
  /** Findings whose rule compares the same account across two or more bureaus. */
  crossBureauInconsistencies: number
  identityObservations: number
  inquiriesRead: number
  totalBalanceCents: number | null
  totalPastDueCents: number | null
  utilization: ReportUtilizationSummary
}

/** Personal-information entries read from the report, paired with whether they match the
 *  identity the consumer attested to at intake. */
export type ReportIdentityRow = {
  id: Id
  bureau: Bureau
  field: string
  value: string
  attestationMatch: 'matches-attested' | 'differs-from-attested' | 'not-compared'
  source: Pick<SourceReference, 'kind' | 'locator'>
}

export type ReimportAccountRef = { creditor: string; bureau: Bureau; maskedAccount: string }
export type ReimportFieldChange = { field: string; from: string; to: string }
export type ReimportDiff = {
  previousConsumerReportId: Id
  previousGeneratedAt: string
  newAccounts: ReimportAccountRef[]
  removedAccounts: ReimportAccountRef[]
  changedAccounts: Array<ReimportAccountRef & { changes: ReimportFieldChange[] }>
  scoreChanges: Array<{ bureau: Bureau; from: number; to: number; delta: number }>
  findingsResolved: string[]
  findingsNew: string[]
  findingsUnchanged: number
}

export type ReportContent = { catalogVersion: string; rulesetVersion: string; parserVersion: string; sectionPrimers: ReportPrimer[]; coverage: CoverageRow[]; parserFields: ParserFieldAvailability[]; summary?: ReportSummary; identityRows?: ReportIdentityRow[]; reimport?: ReimportDiff; pendingMatchGroups?: number; accountRows?: ReportAccountRow[]; scoreRows?: ReportScoreRow[]; inquiryRows?: ReportInquiryRow[] }
export type ReportPresentationProfile = {
  revision: number
  organizationName: string
  preparedByLabel?: string
  preparedByTitle?: string
  logoUrl?: string
  supportEmail?: string
  websiteUrl?: string
  supportPhone?: string
  mailingAddress?: string
  reportTitle?: string
  reportSubtitle?: string
  accent: 'gold' | 'charcoal' | 'sage'
  printStyle: 'standard' | 'compact'
  closingNote?: string
  updatedAt?: string
  updatedBy?: Id
}
export type ReportRecipient = { displayName: string; source: Pick<SourceReference, 'kind' | 'locator'>; confidence: number }
export type ConsumerReport = { id: Id; userId: Id; analysisId: Id; /** The CanonicalReport this reading was produced from. Lets the corrections surface target the right source document without a second round trip through the analysis. */ sourceReportId?: Id; limitations: string[]; overview: Record<string, number>; findings: ReportFinding[]; actions: ActionItem[]; content?: ReportContent; presentation: ReportPresentationProfile; recipient?: ReportRecipient; generatedAt: string }
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
