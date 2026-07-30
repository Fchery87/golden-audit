import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { applicationVersion } from '../../domain/src/index.js'
import { evaluateAnalysis, SEVERITY_RANK } from '../../analysis-core/src/index.js'
import { redactReportText } from '../../redaction/src/index.js'
import { assertSafeConsumerOutput, type NarrationEvaluation } from '../../output-guard/src/index.js'
import { execSync } from 'node:child_process'
import { parseIdentityIqPdfBbox } from '../../parser/src/index.js'
import type { ParserReport, ParserTradeline, ParserValue } from '../../parser/src/index.js'
import type { Analysis as CoreAnalysis, Finding, FindingClassification, RuleAudit, SourceReference } from '../../analysis-core/src/index.js'
import type { AccessibilityEvidenceReport } from '../../../apps/web/src/accessibility-report.js'
import type { ComprehensionEvidenceReport } from '../../../apps/web/src/comprehension-report.js'

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

/** FCRA counsel Q-L3 (ticket 12): standalone written authorization the consumer expressly accepts before any processing. */
export const AUTHORIZATION_VERSION = 'authorization-2026-01'
export const AUTHORIZATION_TEXT = [
  'I authorize this service to do the following with the credit report I upload, for my personal educational use only:',
  '1. Receive the report I provide and parse/analyze it to produce educational Findings.',
  '2. Temporarily store the report under the disclosed retention policy, then delete it on schedule or on my request.',
  '3. Return the Findings only to me — never to lenders, landlords, employers, insurers, brokers, attorneys, or credit-repair businesses.',
  '4. Refrain from selling, sharing, advertising against, or training models on my report data.',
  'This is a free pilot: no payment, no data sale, no advertising. This is educational information only, is not legal advice, and creates no attorney-client relationship.',
].join('\n')

/** FCRA counsel Q-L4 (ticket 12): disclosed retention minimization. */
export const RETENTION_POLICY = {
  originalsMaxDays: 30,
  deletionControl: 'Consumer-initiated deletion available at any time via requestDeletion.',
  description: 'Uploaded reports are retained only as long as operationally necessary to deliver the analysis (at most 30 days), then deleted. Analysis artifacts are deleted on consumer request.',
} as const

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

type User = { id: Id; email: string; passwordHash: string; passwordSalt: string; consent?: Consent }
type Session = { id: Id; userId: Id; revokedAt?: string }
type Workspace = { id: Id; userId: Id; createdAt: string }

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

// SourceReference is imported from analysis-core (see imports above) and re-exported.
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
  status: CanonicalValue<string>
  opened: CanonicalValue<string>
  updated: CanonicalValue<string>
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
type GovernanceHistory = { action: GovernanceStatus | 'revision-requested'; reviewerId: Id; at: string; reason: string }
export type Authority = { id: Id; citation: string; jurisdiction: Jurisdiction; effectiveFrom: string; permittedUse: string; limitations: string[]; status: GovernanceStatus; history: GovernanceHistory[] }
export type EducationModule = { id: Id; title: string; body: string; jurisdiction: Jurisdiction; effectiveFrom: string; permittedUse: string; limitations: string[]; status: GovernanceStatus; history: GovernanceHistory[] }
export type ReviewerRole = 'compliance-reviewer' | 'engineering-reviewer' | 'release-manager'
export type Reviewer = { id: Id; role: ReviewerRole }
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

// Finding is imported from analysis-core and re-exported. Analysis is the ingest-agnostic
// core analysis plus the host's ownership fields (userId, reportId).
export type Analysis = CoreAnalysis & { userId: Id; reportId: Id }

type ActionItem = { id: Id; findingId: Id; status: 'unresolved' | 'recognized' | 'dismissed' | 'under-review' | 'complete'; note?: string; reason?: string; documents: string[] }
export type ConsumerReport = { id: Id; userId: Id; analysisId: Id; limitations: string[]; overview: Record<string, number>; findings: Finding[]; actions: ActionItem[]; generatedAt: string }
export type ExportArtifact = { id: Id; userId: Id; reportId: Id; content: string; createdAt: string }
export type DeletionJob = { id: Id; userId: Id; status: 'pending-provider' | 'complete'; deleted: string[]; delayed: string[]; completedAt?: string }
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
export type PilotEvidenceBundle = {
  generatedAt: string
  pilotGate: PilotGate
  quality: QualityReport
  drills: PilotDrillEvidenceReport
  comprehension: ComprehensionEvidenceReport
  accessibility: AccessibilityEvidenceReport
  narration?: NarrationEvaluation
  summary: PilotEvidenceSummary
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

type TimestampRecord = {
  uploadCompletedAt?: string
  reportParsedAt?: string
  analysisCreatedAt?: string
}

export type PlatformSnapshot = {
  users: User[]
  usersByEmail: Array<[string, Id]>
  sessions: Session[]
  workspaces: Workspace[]
  authorizations: AuthorizationRecord[]
  authorizationByUser: Array<[Id, Id]>
  uploads: Upload[]
  uploadByHash: Array<[string, Id]>
  rawUploadBytes: Array<[Id, string]>
  reports: CanonicalReport[]
  authorities: Authority[]
  modules: EducationModule[]
  rules: Rule[]
  publishedRulesets: Array<[string, Rule[]]>
  publishedAuthorities: Authority[]
  publishedModules: EducationModule[]
  matches: MatchGroup[]
  analyses: Analysis[]
  consumerReports: ConsumerReport[]
  exports: ExportArtifact[]
  deletionJobs: DeletionJob[]
  reviewers: Reviewer[]
  pilotApprovals: PilotApproval[]
  pilotDrills: PilotDrill[]
  launchScope?: LaunchScope
  auditEvents: AuditEvent[]
}

const now = () => new Date().toISOString()
const hashPassword = (password: string, salt: string) => scryptSync(password, salt, 32).toString('hex')
const maskAccount = (value: string) => `••••${value.replace(/\D/g, '').slice(-4)}`

export class CreditAnalysisPlatform {
  private users = new Map<Id, User>()
  private usersByEmail = new Map<string, Id>()
  private sessions = new Map<Id, Session>()
  private workspaces = new Map<Id, Workspace>()
  private authorizations = new Map<Id, AuthorizationRecord>()
  private authorizationByUser = new Map<Id, Id>()
  private uploads = new Map<Id, Upload>()
  private uploadByHash = new Map<string, Id>()
  private reports = new Map<Id, CanonicalReport>()
  private authorities = new Map<Id, Authority>()
  private modules = new Map<Id, EducationModule>()
  private rules = new Map<Id, Rule>()
  private publishedRulesets = new Map<string, Rule[]>()
  private publishedAuthorities = new Map<Id, Authority>()
  private publishedModules = new Map<Id, EducationModule>()
  private matches = new Map<Id, MatchGroup>()
  private analyses = new Map<Id, Analysis>()
  private consumerReports = new Map<Id, ConsumerReport>()
  private exports = new Map<Id, ExportArtifact>()
  private deletionJobs = new Map<Id, DeletionJob>()
  /** Raw PDF bytes for binary uploads, kept OUT of the returned Upload object (PII hygiene). */
  private rawUploadBytes = new Map<Id, Uint8Array>()
  private reviewers = new Map<Id, Reviewer>()
  private pilotApprovals = new Map<PilotApprovalArea, PilotApproval>()
  private pilotDrills: PilotDrill[] = []
  private launchScope: LaunchScope | undefined
  private timelineBySubject = new Map<Id, TimestampRecord>()
  auditEvents: AuditEvent[] = []

  register(input: { email: string; password: string }): { userId: Id; sessionId: Id } {
    if (!/^\S+@\S+\.\S+$/.test(input.email)) throw new Error('A valid email is required')
    if (input.password.length < 12) throw new Error('Password must be at least 12 characters')
    if (this.usersByEmail.has(input.email.toLowerCase())) throw new Error('Account already exists')
    const userId = randomUUID(); const salt = randomBytes(16).toString('hex')
    this.users.set(userId, { id: userId, email: input.email.toLowerCase(), passwordSalt: salt, passwordHash: hashPassword(input.password, salt) })
    this.usersByEmail.set(input.email.toLowerCase(), userId)
    return { userId, sessionId: this.createSession(userId) }
  }

  signIn(input: { email: string; password: string }): Id {
    const userId = this.usersByEmail.get(input.email.toLowerCase()); if (!userId) throw new Error('Invalid credentials')
    const user = this.users.get(userId); if (!user) throw new Error('Invalid credentials')
    const actual = Buffer.from(hashPassword(input.password, user.passwordSalt), 'hex'); const expected = Buffer.from(user.passwordHash, 'hex')
    if (!timingSafeEqual(actual, expected)) throw new Error('Invalid credentials')
    return this.createSession(userId)
  }

  private createSession(userId: Id): Id { const id = randomUUID(); this.sessions.set(id, { id, userId }); return id }
  signOut(sessionId: Id): void { this.revokeSession(sessionId) }
  revokeSession(sessionId: Id): void { const session = this.sessions.get(sessionId); if (!session) return; session.revokedAt = now(); this.audit('session-revoked', session.userId, sessionId) }
  revokeOtherSessions(sessionId: Id): void { const actor = this.requireSession(sessionId); for (const session of this.sessions.values()) if (session.userId === actor && session.id !== sessionId) this.revokeSession(session.id) }

  recordConsent(sessionId: Id, input: Omit<Consent, 'acceptedAt'>): Workspace {
    const userId = this.requireSession(sessionId)
    if (!input.adultUSConsumer || !input.authorizedReportUse || !input.educationalLimitations || !input.sensitiveDataHandling) throw new Error('All required acknowledgements are required')
    if (!this.launchScope) throw new Error('Launch scope is not configured for the pilot')
    if (!this.launchScope.approvedStates.includes(input.residence) || !this.launchScope.approvedStates.includes(input.analysisJurisdiction)) throw new Error('Jurisdiction is not enabled for the pilot')
    const user = this.users.get(userId); if (!user) throw new Error('User not found')
    user.consent = { ...input, acceptedAt: now() }
    const workspace = { id: randomUUID(), userId, createdAt: now() }; this.workspaces.set(workspace.id, workspace)
    this.audit('consent-recorded', userId, workspace.id, { version: input.version, jurisdiction: input.analysisJurisdiction })
    return workspace
  }

  acceptAuthorization(sessionId: Id): AuthorizationRecord {
    const userId = this.requireSession(sessionId)
    const record: AuthorizationRecord = { id: randomUUID(), userId, version: AUTHORIZATION_VERSION, acceptedAt: now() }
    this.authorizations.set(record.id, record); this.authorizationByUser.set(userId, record.id)
    this.audit('authorization-accepted', userId, record.id, { version: AUTHORIZATION_VERSION })
    return structuredClone(record)
  }
  getAuthorization(sessionId: Id): AuthorizationRecord { const userId = this.requireSession(sessionId); const id = this.authorizationByUser.get(userId); const record = id ? this.authorizations.get(id) : undefined; if (!record) throw new Error('No written authorization on record'); return structuredClone(record) }
  getRetentionPolicy(): typeof RETENTION_POLICY { return RETENTION_POLICY }
  private requireAuthorization(userId: Id): void { if (!this.authorizationByUser.has(userId)) throw new Error('Written authorization required before processing') }

  configureLaunchScope(input: Omit<LaunchScope, 'configuredAt'>): LaunchScope {
    if (input.mode === 'one-state-free-pilot') {
      if (input.approvedStates.length !== 1) throw new Error('One-state pilot requires exactly one approved state')
      if (!input.provisionalSelectedState || input.provisionalSelectedState !== input.approvedStates[0]) throw new Error('One-state pilot requires a matching provisional selected state')
    }
    if (!input.approvedStates.length && input.mode !== 'launch-paused-pending-review') throw new Error('At least one approved state is required unless launch is paused')
    if (!input.stateSelectionEvidenceReference.trim() || !input.availabilityClaim.trim() || !input.notes.trim()) throw new Error('Launch scope requires evidence, availability claim, and notes')
    const scope: LaunchScope = { ...input, approvedStates: [...new Set(input.approvedStates)], configuredAt: now() }
    this.launchScope = scope
    this.audit('launch-scope-configured', 'system', scope.provisionalSelectedState ?? 'launch-scope', { mode: scope.mode, approvedStates: scope.approvedStates.join(',') })
    return structuredClone(scope)
  }
  getLaunchScope(): LaunchScope {
    if (!this.launchScope) throw new Error('Launch scope is not configured for the pilot')
    return structuredClone(this.launchScope)
  }

  hydrateLaunchScope(input: PilotApprovalRecordFile): LaunchScope | undefined {
    if (!input.launchScope) return undefined
    const approvedStates = input.launchScope.approvedStates.map(state => state.startsWith('US-') ? state as Jurisdiction : `US-${state}` as Jurisdiction)
    const provisionalSelectedState = input.launchScope.provisionalSelectedState
      ? (input.launchScope.provisionalSelectedState.startsWith('US-') ? input.launchScope.provisionalSelectedState as Jurisdiction : `US-${input.launchScope.provisionalSelectedState}` as Jurisdiction)
      : undefined
    const scope = this.configureLaunchScope({
      mode: input.launchScope.mode,
      approvedStates,
      ...(provisionalSelectedState ? { provisionalSelectedState } : {}),
      stateSelectionEvidenceReference: input.launchScope.stateSelectionEvidenceReference,
      availabilityClaim: input.launchScope.availabilityClaim,
      pricingMode: input.launchScope.pricingMode,
      nationwideStatus: input.launchScope.nationwideStatus,
      notes: input.launchScope.notes,
    })
    return scope
  }

  loadPilotApprovals(input: PilotApprovalRecordFile): { launchScope?: LaunchScope; approvalsLoaded: number; fixtureOnly: boolean } {
    const scope = this.hydrateLaunchScope(input)
    const fixtureOnly = input.scope === 'test-fixture-only' || /fixture/i.test(input.status) || /not approvals?/i.test(input._warning ?? '')
    if (fixtureOnly) return { ...(scope ? { launchScope: scope } : {}), approvalsLoaded: 0, fixtureOnly }
    let approvalsLoaded = 0
    for (const approval of input.approvals) {
      this.recordPilotApproval({ area: approval.area, approver: approval.approver, evidenceReference: approval.evidenceReference })
      approvalsLoaded += 1
    }
    return { ...(scope ? { launchScope: scope } : {}), approvalsLoaded, fixtureOnly }
  }

  exportSnapshot(): PlatformSnapshot {
    return {
      users: [...this.users.values()].map(item => structuredClone(item)),
      usersByEmail: [...this.usersByEmail.entries()],
      sessions: [...this.sessions.values()].map(item => structuredClone(item)),
      workspaces: [...this.workspaces.values()].map(item => structuredClone(item)),
      authorizations: [...this.authorizations.values()].map(item => structuredClone(item)),
      authorizationByUser: [...this.authorizationByUser.entries()],
      uploads: [...this.uploads.values()].map(item => structuredClone(item)),
      uploadByHash: [...this.uploadByHash.entries()],
      rawUploadBytes: [...this.rawUploadBytes.entries()].map(([id, bytes]) => [id, Buffer.from(bytes).toString('base64')]),
      reports: [...this.reports.values()].map(item => structuredClone(item)),
      authorities: [...this.authorities.values()].map(item => structuredClone(item)),
      modules: [...this.modules.values()].map(item => structuredClone(item)),
      rules: [...this.rules.values()].map(item => structuredClone(item)),
      publishedRulesets: [...this.publishedRulesets.entries()].map(([version, rules]) => [version, rules.map(rule => structuredClone(rule))]),
      publishedAuthorities: [...this.publishedAuthorities.values()].map(item => structuredClone(item)),
      publishedModules: [...this.publishedModules.values()].map(item => structuredClone(item)),
      matches: [...this.matches.values()].map(item => structuredClone(item)),
      analyses: [...this.analyses.values()].map(item => structuredClone(item)),
      consumerReports: [...this.consumerReports.values()].map(item => structuredClone(item)),
      exports: [...this.exports.values()].map(item => structuredClone(item)),
      deletionJobs: [...this.deletionJobs.values()].map(item => structuredClone(item)),
      reviewers: [...this.reviewers.values()].map(item => structuredClone(item)),
      pilotApprovals: [...this.pilotApprovals.values()].map(item => structuredClone(item)),
      pilotDrills: this.pilotDrills.map(item => structuredClone(item)),
      ...(this.launchScope ? { launchScope: structuredClone(this.launchScope) } : {}),
      auditEvents: this.auditEvents.map(item => structuredClone(item)),
    }
  }

  importSnapshot(snapshot: PlatformSnapshot): void {
    this.users = new Map(snapshot.users.map(item => [item.id, structuredClone(item)]))
    this.usersByEmail = new Map(snapshot.usersByEmail)
    this.sessions = new Map(snapshot.sessions.map(item => [item.id, structuredClone(item)]))
    this.workspaces = new Map(snapshot.workspaces.map(item => [item.id, structuredClone(item)]))
    this.authorizations = new Map(snapshot.authorizations.map(item => [item.id, structuredClone(item)]))
    this.authorizationByUser = new Map(snapshot.authorizationByUser)
    this.uploads = new Map(snapshot.uploads.map(item => [item.id, structuredClone(item)]))
    this.uploadByHash = new Map(snapshot.uploadByHash)
    this.rawUploadBytes = new Map(snapshot.rawUploadBytes.map(([id, base64]) => [id, Buffer.from(base64, 'base64')]))
    this.reports = new Map(snapshot.reports.map(item => [item.id, structuredClone(item)]))
    this.authorities = new Map(snapshot.authorities.map(item => [item.id, structuredClone(item)]))
    this.modules = new Map(snapshot.modules.map(item => [item.id, structuredClone(item)]))
    this.rules = new Map(snapshot.rules.map(item => [item.id, structuredClone(item)]))
    this.publishedRulesets = new Map(snapshot.publishedRulesets.map(([version, rules]) => [version, rules.map(rule => structuredClone(rule))]))
    this.publishedAuthorities = new Map(snapshot.publishedAuthorities.map(item => [item.id, structuredClone(item)]))
    this.publishedModules = new Map(snapshot.publishedModules.map(item => [item.id, structuredClone(item)]))
    this.matches = new Map(snapshot.matches.map(item => [item.id, structuredClone(item)]))
    this.analyses = new Map(snapshot.analyses.map(item => [item.id, structuredClone(item)]))
    this.consumerReports = new Map(snapshot.consumerReports.map(item => [item.id, structuredClone(item)]))
    this.exports = new Map(snapshot.exports.map(item => [item.id, structuredClone(item)]))
    this.deletionJobs = new Map(snapshot.deletionJobs.map(item => [item.id, structuredClone(item)]))
    this.reviewers = new Map(snapshot.reviewers.map(item => [item.id, structuredClone(item)]))
    this.pilotApprovals = new Map(snapshot.pilotApprovals.map(item => [item.area, structuredClone(item)]))
    this.pilotDrills = (snapshot.pilotDrills ?? []).map(item => structuredClone(item))
    this.launchScope = snapshot.launchScope ? structuredClone(snapshot.launchScope) : undefined
    this.auditEvents = snapshot.auditEvents.map(item => structuredClone(item))
  }

  saveSnapshot(filePath: string): void {
    writeFileSync(filePath, JSON.stringify(this.exportSnapshot(), null, 2))
  }

  loadSnapshot(filePath: string): void {
    const parsed: unknown = JSON.parse(readFileSync(filePath, 'utf8'))
    if (!parsed || typeof parsed !== 'object') throw new Error('Snapshot file is invalid')
    this.importSnapshot(parsed as PlatformSnapshot)
  }

  getWorkspace(sessionId: Id, workspaceId: Id): Workspace { const userId = this.requireSession(sessionId); const workspace = this.workspaces.get(workspaceId); if (!workspace || workspace.userId !== userId) throw new Error('Not found'); return structuredClone(workspace) }

  initializeUpload(sessionId: Id, workspaceId: Id, ttlMs = 300_000): Upload {
    const userId = this.requireSession(sessionId); const workspace = this.getWorkspace(sessionId, workspaceId); const consent = this.users.get(userId)?.consent
    if (!consent) throw new Error('Consent gate incomplete')
    const upload: Upload = { id: randomUUID(), userId, workspaceId: workspace.id, token: randomBytes(24).toString('base64url'), tokenExpiresAt: new Date(Date.now() + ttlMs).toISOString(), stage: 'initialized' }
    this.uploads.set(upload.id, upload); return structuredClone(upload)
  }

  completeUpload(input: { uploadId: Id; token: string; fileName: string; mediaType: string; bytes: Uint8Array }): Upload {
    const upload = this.uploads.get(input.uploadId); if (!upload || upload.token !== input.token) throw new Error('Upload authorization invalid')
    if (Date.parse(upload.tokenExpiresAt) <= Date.now()) throw new Error('Upload authorization expired')
    if (upload.completedAt) return structuredClone(upload)
    this.requireAuthorization(upload.userId) // FCRA counsel Q-L3: written authorization required before any processing
    upload.stage = 'scanning'
    const content = Buffer.from(input.bytes); const lowerName = input.fileName.toLowerCase(); const isPdf = input.mediaType === 'application/pdf' && lowerName.endsWith('.pdf') && content.subarray(0, 5).toString() === '%PDF-'
    const isHtml = input.mediaType === 'text/html' && lowerName.endsWith('.html') && /^\s*<(?:!doctype html|html)/i.test(content.toString('utf8'))
    if (!isPdf && !isHtml) return this.failUpload(upload, 'final-failure', 'Unsupported or mismatched report format')
    if (content.byteLength > 5_000_000) return this.failUpload(upload, 'final-failure', 'Report exceeds processing limits')
    if (/\/Encrypt\b/i.test(content.toString('latin1'))) return this.failUpload(upload, 'final-failure', 'Password-protected PDFs are not supported')
    // The EICAR/script/iframe/URL guard is an HTML-injection defense; it must not run on raw PDF bytes
    // (binary PDFs legitimately contain URL-like byte sequences). PDF structural safety is covered above.
    if (!isPdf) { const raw = content.toString('utf8'); if (/EICAR|<script|javascript:|<iframe|https?:\/\//i.test(raw)) return this.failUpload(upload, 'quarantined', 'The report could not be processed safely', 'unsafe') }
    const sourceHash = createHash('sha256').update(content).digest('hex'); const existing = this.uploadByHash.get(`${upload.userId}:${sourceHash}`)
    if (existing && existing !== upload.id) return structuredClone(this.uploads.get(existing) ?? upload)
    upload.fileName = input.fileName; upload.mediaType = isPdf ? 'application/pdf' : 'text/html'; upload.size = content.byteLength; upload.sourceHash = sourceHash; upload.scanResult = 'clean'; upload.retentionClass = 'consumer-report'; upload.stage = 'ready-to-parse'
    if (isPdf) { this.rawUploadBytes.set(upload.id, content) } else { const raw = content.toString('utf8'); const sanitized = raw.replace(/<script[\s\S]*?<\/script>/gi, ''); const { redacted, redactions } = redactReportText(sanitized); upload.sanitizedContent = redacted; upload.redactionCount = redactions }
    upload.completedAt = now(); this.uploadByHash.set(`${upload.userId}:${sourceHash}`, upload.id)
    this.recordTimestamp(upload.id, { uploadCompletedAt: upload.completedAt })
    this.audit('upload-completed', upload.userId, upload.id, { mediaType: upload.mediaType, sourceHash }); return structuredClone(upload)
  }

  private failUpload(upload: Upload, stage: UploadStage, message: string, scanResult?: 'unsafe'): Upload { upload.stage = stage; upload.failureMessage = message; if (scanResult) upload.scanResult = scanResult; this.audit(stage === 'quarantined' ? 'upload-quarantined' : 'upload-failed', upload.userId, upload.id); return structuredClone(upload) }

  parseReport(sessionId: Id, uploadId: Id): CanonicalReport {
    const userId = this.requireSession(sessionId); const upload = this.uploads.get(uploadId); if (!upload || upload.userId !== userId) throw new Error('Not found'); if (upload.stage !== 'ready-to-parse') throw new Error('Upload is not parseable')
    if (upload.mediaType === 'application/pdf') return this.parseIdentityIqPdf(upload, userId)
    if (!upload.sanitizedContent) throw new Error('Upload is not parseable')
    const marker = 'GOLDEN-AUDIT-REPORT:'; const markerIndex = upload.sanitizedContent.indexOf(marker); if (markerIndex < 0) throw new Error('Unsupported report provider or template')
    const json = upload.sanitizedContent.slice(markerIndex + marker.length).replace(/<\/body>[\s\S]*/i, '').replace(/%%EOF[\s\S]*/i, '').trim(); const input: unknown = JSON.parse(json)
    if (!isParserInput(input)) throw new Error('Report schema validation failed')
    const parserVersion = 'fixture-adapter@1'; const extractionMethod = 'html-selector' // synthetic-fixture path is HTML-only (PDFs route to the real adapter)
    const makeValue = <T>(bureau: Bureau, field: string, normalized: T | null, originalDisplay: string, locator: string, confidence = 1): CanonicalValue<T> => ({ id: randomUUID(), bureau, field, normalized, originalDisplay, state: normalized === null ? 'unknown' : 'known', source: { kind: 'element', locator, snippet: originalDisplay.slice(0, 80) }, extractionMethod, parserVersion, confidence })
    const tradelines = input.tradelines.map((line, index): Tradeline => ({ id: randomUUID(), creditor: makeValue(line.bureau, 'creditor', line.creditor, line.creditor, `${index}:creditor`), maskedAccount: makeValue(line.bureau, 'account', maskAccount(line.account), maskAccount(line.account), `${index}:account`), accountType: makeValue(line.bureau, 'accountType', line.accountType, line.accountType, `${index}:type`), balance: { ...makeValue(line.bureau, 'balance', line.balance, `$${(line.balance / 100).toFixed(2)}`, `${index}:balance`, line.confidence ?? 1), currency: 'USD' }, status: makeValue(line.bureau, 'status', line.status, line.status, `${index}:status`), opened: { ...makeValue(line.bureau, 'opened', line.opened, line.opened, `${index}:opened`), datePrecision: line.opened.length === 7 ? 'month' : 'day' }, updated: { ...makeValue(line.bureau, 'updated', line.updated, line.updated, `${index}:updated`), datePrecision: line.updated.length === 7 ? 'month' : 'day' } }))
    const firstBureau = input.tradelines[0]?.bureau ?? 'equifax'; const mapText = (items: string[], field: string) => items.map((value, i) => makeValue(firstBureau, field, value, value, `${field}:${i}`))
    const report: CanonicalReport = { id: randomUUID(), userId, uploadId, provider: input.provider, template: input.template, parserVersion, normalizedVersion: 1, reportDate: input.reportDate, identity: mapText(input.identity, 'identity'), addresses: mapText(input.addresses, 'address'), employers: mapText(input.employers, 'employer'), tradelines, collections: [], inquiries: mapText(input.inquiries, 'inquiry'), publicRecords: mapText(input.publicRecords, 'publicRecord'), scores: input.scores.map((score, i) => makeValue(firstBureau, 'score', score, String(score), `score:${i}`)), remarks: mapText(input.remarks, 'remark'), reviewComplete: false }
    const parsedAt = now()
    this.reports.set(report.id, report); this.recordTimestamp(report.id, { reportParsedAt: parsedAt, ...(upload.completedAt ? { uploadCompletedAt: upload.completedAt } : {}) }); this.audit('report-parsed', userId, report.id, { parserVersion }); return structuredClone(report)
  }

  reviewValue(sessionId: Id, reportId: Id, valueId: Id, input: { decision: ReviewDecision; reason: string; replacement?: string | number }): CanonicalReport {
    const userId = this.requireSession(sessionId); const report = this.reports.get(reportId); if (!report || report.userId !== userId) throw new Error('Not found'); const value = allValues(report).find(item => item.id === valueId); if (!value) throw new Error('Value not found')
    value.review = { decision: input.decision, reason: input.reason, actorId: userId, at: now(), ...(input.replacement !== undefined ? { replacement: input.replacement } : {}) }; report.normalizedVersion += 1; this.audit('report-value-reviewed', userId, valueId, { decision: input.decision }); return structuredClone(report)
  }
  completeReview(sessionId: Id, reportId: Id): void { const userId = this.requireSession(sessionId); const report = this.reports.get(reportId); if (!report || report.userId !== userId) throw new Error('Not found'); report.reviewComplete = true }

  /** REAL IdentityIQ PDF path: bytes → pdftotext -bbox → parser → canonical report. */
  private parseIdentityIqPdf(upload: Upload, userId: Id): CanonicalReport {
    const bytes = this.rawUploadBytes.get(upload.id)
    if (!bytes) throw new Error('Report bytes unavailable; re-upload required')
    const parsed = parseIdentityIqPdfBbox(extractBboxFromPdfBytes(bytes))
    if (parsed.tradelines.length === 0) throw new Error('Unsupported report provider or template') // reject rather than guess
    const report = mapParserReportToCanonical(parsed, userId, upload.id)
    const parsedAt = now()
    this.reports.set(report.id, report); this.recordTimestamp(report.id, { reportParsedAt: parsedAt, ...(upload.completedAt ? { uploadCompletedAt: upload.completedAt } : {}) }); this.audit('report-parsed', userId, report.id, { parserVersion: report.parserVersion })
    return structuredClone(report)
  }
  getSourceSnippet(sessionId: Id, reportId: Id, valueId: Id): SourceReference { const userId = this.requireSession(sessionId); const report = this.reports.get(reportId); if (!report || report.userId !== userId) throw new Error('Not found'); const value = allValues(report).find(item => item.id === valueId); if (!value) throw new Error('Not found'); return structuredClone(value.source) }

  registerReviewer(input: Reviewer): void { this.reviewers.set(input.id, structuredClone(input)) }
  private requireReviewer(reviewerId: Id, roles: ReviewerRole[]): Reviewer { const reviewer = this.reviewers.get(reviewerId); if (!reviewer || !roles.includes(reviewer.role)) throw new Error('Reviewer is not authorized'); return reviewer }
  createAuthority(reviewerId: Id, input: Omit<Authority, 'id' | 'status' | 'history'>): Authority { this.requireReviewer(reviewerId, ['compliance-reviewer']); const item = { ...input, id: randomUUID(), status: 'draft' as const, history: [] }; this.authorities.set(item.id, item); return structuredClone(item) }
  createEducationModule(reviewerId: Id, input: Omit<EducationModule, 'id' | 'status' | 'history'>): EducationModule { this.requireReviewer(reviewerId, ['compliance-reviewer']); const item = { ...input, id: randomUUID(), status: 'draft' as const, history: [] }; this.modules.set(item.id, item); return structuredClone(item) }
  createRule(reviewerId: Id, input: Omit<Rule, 'id' | 'status' | 'history'>): Rule { this.requireReviewer(reviewerId, ['engineering-reviewer']); if (!input.requiredInputs.length || !input.testCases.length) throw new Error('Rule contract is incomplete'); const item = { ...input, id: randomUUID(), status: 'draft' as const, history: [] }; this.rules.set(item.id, item); return structuredClone(item) }
  reviewGovernance(kind: 'authority' | 'module' | 'rule', id: Id, reviewerId: Id, action: Exclude<GovernanceStatus, 'draft'> | 'revision-requested', reason: string): void { this.requireReviewer(reviewerId, ['compliance-reviewer', 'engineering-reviewer']); const map = kind === 'authority' ? this.authorities : kind === 'module' ? this.modules : this.rules; const item = map.get(id); if (!item) throw new Error('Governance item not found'); item.history.push({ action, reviewerId, at: now(), reason }); if (action !== 'revision-requested') item.status = action; this.audit(`governance-${action}`, reviewerId, id, { kind, reason }) }
  publishRuleset(reviewerId: Id, jurisdiction: Jurisdiction, effectiveDate: string): string { this.requireReviewer(reviewerId, ['release-manager']); const rules = [...this.rules.values()].filter(rule => rule.status === 'approved' && rule.jurisdiction === jurisdiction && rule.effectiveFrom <= effectiveDate && rule.authorityIds.every(id => this.authorities.get(id)?.status === 'approved') && rule.educationModuleIds.every(id => this.modules.get(id)?.status === 'approved')); if (!rules.length) throw new Error('No approved rules available'); const version = createHash('sha256').update(JSON.stringify(rules)).digest('hex').slice(0, 12); const published = structuredClone(rules).map(rule => ({ ...rule, status: 'published' as const, version })); this.publishedRulesets.set(version, published); for (const rule of rules) rule.status = 'published'; for (const rule of rules) for (const id of rule.authorityIds) { const authority = this.authorities.get(id); if (authority) { authority.status = 'published'; this.publishedAuthorities.set(id, structuredClone(authority)) } } for (const rule of rules) for (const id of rule.educationModuleIds) { const module = this.modules.get(id); if (module) { module.status = 'published'; this.publishedModules.set(id, structuredClone(module)) } } this.audit('ruleset-published', reviewerId, version, { jurisdiction }); return version }
  disableGovernance(kind: 'authority' | 'module' | 'rule', id: Id, reviewerId: Id, reason: string): void { this.requireReviewer(reviewerId, ['compliance-reviewer', 'release-manager']); this.reviewGovernance(kind, id, reviewerId, 'disabled', reason) }
  getEffectiveRules(jurisdiction: Jurisdiction, effectiveDate: string): Rule[] { return [...this.publishedRulesets.values()].flat().filter(rule => rule.jurisdiction === jurisdiction && rule.effectiveFrom <= effectiveDate && rule.status === 'published' && rule.authorityIds.every(id => this.authorities.get(id)?.status !== 'disabled') && rule.educationModuleIds.every(id => this.modules.get(id)?.status !== 'disabled')).map(rule => structuredClone(rule)) }
  getEffectiveAuthorities(jurisdiction: Jurisdiction, effectiveDate: string): Authority[] { return [...this.publishedAuthorities.values()].filter(item => item.jurisdiction === jurisdiction && item.effectiveFrom <= effectiveDate && this.authorities.get(item.id)?.status !== 'disabled').map(item => structuredClone(item)) }
  getEffectiveEducationModules(jurisdiction: Jurisdiction, effectiveDate: string): EducationModule[] { return [...this.publishedModules.values()].filter(item => item.jurisdiction === jurisdiction && item.effectiveFrom <= effectiveDate && this.modules.get(item.id)?.status !== 'disabled').map(item => structuredClone(item)) }

  proposeMatches(sessionId: Id, reportId: Id): MatchGroup[] {
    const userId = this.requireSession(sessionId)
    const report = this.reports.get(reportId)
    if (!report || report.userId !== userId) throw new Error('Not found')
    const grouped = new Map<string, Tradeline[]>()
    for (const line of report.tradelines) {
      const key = `${line.creditor.normalized?.toLowerCase()}:${line.maskedAccount.normalized}`
      grouped.set(key, [...(grouped.get(key) ?? []), line])
    }
    const result: MatchGroup[] = []
    for (const lines of grouped.values()) {
      if (lines.length < 2) continue
      const balanceAgreement = new Set(lines.map(line => line.balance.normalized)).size === 1
      const oversized = lines.length > 3
      const confidence = oversized ? 0.72 : (balanceAgreement ? 0.95 : 0.72)
      const group: MatchGroup = {
        id: randomUUID(),
        reportId,
        tradelineIds: lines.map(line => line.id),
        confidence,
        signals: ['creditor', 'masked-account', ...(balanceAgreement ? ['balance'] : []), ...(oversized ? ['collision-set'] : [])],
        state: oversized ? 'split' : confidence >= 0.9 ? 'proposed' : 'split',
        history: [],
      }
      this.matches.set(group.id, group)
      result.push(group)
    }
    return structuredClone(result)
  }
  decideMatch(sessionId: Id, matchId: Id, action: 'confirmed' | 'rejected' | 'split' | 'merged', reason: string): MatchGroup { const userId = this.requireSession(sessionId); const match = this.matches.get(matchId); const report = match && this.reports.get(match.reportId); if (!match || !report || report.userId !== userId) throw new Error('Not found'); if (action === 'confirmed' && match.tradelineIds.length > 3) throw new Error('Oversized collision sets require subgroup confirmation'); match.state = action; match.history.push({ action, actorId: userId, at: now(), reason }); this.audit('match-decision', userId, match.id, { action }); return structuredClone(match) }

  confirmMatchSubgroup(sessionId: Id, matchId: Id, tradelineIds: Id[], reason: string): MatchGroup {
    const userId = this.requireSession(sessionId)
    const match = this.matches.get(matchId)
    const report = match && this.reports.get(match.reportId)
    if (!match || !report || report.userId !== userId) throw new Error('Not found')
    if (match.state !== 'split') throw new Error('Match subgrouping requires a split collision set')
    const uniqueTradelineIds = [...new Set(tradelineIds)]
    if (uniqueTradelineIds.length < 2) throw new Error('At least two tradelines are required')
    if (!uniqueTradelineIds.every(id => match.tradelineIds.includes(id))) throw new Error('Subset must come from the parent collision set')
    const selected = report.tradelines.filter(line => uniqueTradelineIds.includes(line.id))
    const balanceAgreement = new Set(selected.map(line => line.balance.normalized)).size === 1
    const confidence = balanceAgreement ? 0.95 : 0.72
    const subgroup: MatchGroup = {
      id: randomUUID(),
      reportId: match.reportId,
      tradelineIds: uniqueTradelineIds,
      confidence,
      signals: ['consumer-confirmed', 'subgroup', 'creditor', 'masked-account', ...(balanceAgreement ? ['balance'] : [])],
      state: 'confirmed',
      history: [{ action: 'confirmed', actorId: userId, at: now(), reason }],
    }
    this.matches.set(subgroup.id, subgroup)
    this.audit('match-subgroup-confirmed', userId, subgroup.id, { parentMatchId: match.id, tradelineCount: String(uniqueTradelineIds.length) })
    return structuredClone(subgroup)
  }

  runAnalysis(sessionId: Id, reportId: Id, rulesetVersion: string, jurisdiction: Jurisdiction): Analysis { const userId = this.requireSession(sessionId); const report = this.reports.get(reportId); if (!report || report.userId !== userId) throw new Error('Not found'); if (!report.reviewComplete) throw new Error('Report review is incomplete'); const unresolvedMatches = [...this.matches.values()].filter(match => match.reportId === reportId && match.state === 'proposed'); if (unresolvedMatches.length) throw new Error('Account matching confirmation is incomplete'); const rules = this.publishedRulesets.get(rulesetVersion); if (!rules) throw new Error('Ruleset not found')
    const core = evaluateAnalysis({ rules, tradelines: report.tradelines, confirmedMatches: [...this.matches.values()].filter(match => match.reportId === reportId && match.state === 'confirmed').map(match => ({ tradelineIds: match.tradelineIds })), versions: { normalizedInput: report.normalizedVersion, ruleset: rulesetVersion, jurisdiction, parser: report.parserVersion, application: applicationVersion } })
    const parsedAt = this.timelineBySubject.get(report.id)?.reportParsedAt
    const analysis: Analysis = { ...core, userId, reportId }; this.analyses.set(analysis.id, analysis); this.recordTimestamp(analysis.id, { analysisCreatedAt: analysis.createdAt, ...(parsedAt ? { reportParsedAt: parsedAt } : {}) }); this.audit('analysis-created', userId, analysis.id, { rulesetVersion }); return structuredClone(analysis) }

  getAnalysis(sessionId: Id, analysisId: Id): Analysis { const userId = this.requireSession(sessionId); const analysis = this.analyses.get(analysisId); if (!analysis || analysis.userId !== userId) throw new Error('Not found'); return structuredClone(analysis) }

  createConsumerReport(sessionId: Id, analysisId: Id): ConsumerReport { const userId = this.requireSession(sessionId); const analysis = this.analyses.get(analysisId); if (!analysis || analysis.userId !== userId) throw new Error('Not found'); const report = this.reports.get(analysis.reportId); if (!report) throw new Error('Not found'); const consumerReport: ConsumerReport = { id: randomUUID(), userId, analysisId, limitations: ['Educational information only', 'No legal verdict, deletion promise, or score prediction'], overview: { tradelines: report.tradelines.length, collections: report.collections.length, inquiries: report.inquiries.length, openAccounts: report.tradelines.filter(line => line.status.normalized?.toLowerCase().includes('open')).length }, findings: [...analysis.findings].sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] || b.confidence - a.confidence), actions: analysis.findings.map(finding => ({ id: randomUUID(), findingId: finding.id, status: 'unresolved', documents: [] })), generatedAt: now() }; this.consumerReports.set(consumerReport.id, consumerReport); return structuredClone(consumerReport) }
  getConsumerReport(sessionId: Id, consumerReportId: Id): ConsumerReport { const userId = this.requireSession(sessionId); const report = this.consumerReports.get(consumerReportId); if (!report || report.userId !== userId) throw new Error('Not found'); return structuredClone(report) }
  updateAction(sessionId: Id, consumerReportId: Id, actionId: Id, patch: Partial<Pick<ActionItem, 'status' | 'note' | 'reason' | 'documents'>>): ActionItem { const userId = this.requireSession(sessionId); const report = this.consumerReports.get(consumerReportId); if (!report || report.userId !== userId) throw new Error('Not found'); const action = report.actions.find(item => item.id === actionId); if (!action) throw new Error('Action not found'); Object.assign(action, patch); this.audit('action-updated', userId, action.id, { status: action.status }); return structuredClone(action) }

  createExport(sessionId: Id, consumerReportId: Id): ExportArtifact { const userId = this.requireSession(sessionId); const report = this.consumerReports.get(consumerReportId); if (!report || report.userId !== userId) throw new Error('Not found'); const existing = [...this.exports.values()].find(item => item.userId === userId && item.reportId === consumerReportId); if (existing) return structuredClone(existing); const analysis = this.analyses.get(report.analysisId); const content = JSON.stringify({ generatedAt: now(), scope: 'Validated personal credit analysis', rulesetVersion: analysis?.versions.ruleset, limitations: report.limitations, disclaimer: 'Educational information only; no specific outcome is promised.', findings: report.findings.map(finding => ({ ...finding, evidence: finding.evidence.map(evidence => ({ ...evidence, value: typeof evidence.value === 'string' && /\d{5,}/.test(evidence.value) ? maskAccount(evidence.value) : evidence.value })) })) }, null, 2); assertSafeConsumerOutput(content); const artifact = { id: randomUUID(), userId, reportId: consumerReportId, content, createdAt: now() }; this.exports.set(artifact.id, artifact); this.audit('export-created', userId, artifact.id); return structuredClone(artifact) }
  getExport(sessionId: Id, exportId: Id): ExportArtifact { const userId = this.requireSession(sessionId); const artifact = this.exports.get(exportId); if (!artifact || artifact.userId !== userId) throw new Error('Not found'); return structuredClone(artifact) }
  requestDeletion(sessionId: Id, providerDelayed = false): DeletionJob { const userId = this.requireSession(sessionId); const deleted: string[] = []; for (const [name, map] of [['uploads', this.uploads], ['reports', this.reports], ['analyses', this.analyses], ['consumer-reports', this.consumerReports], ['exports', this.exports]] as const) for (const [id, item] of map) if ('userId' in item && item.userId === userId) { map.delete(id); deleted.push(`${name}:${id}`) } for (const rbId of [...this.rawUploadBytes.keys()]) if (!this.uploads.has(rbId)) this.rawUploadBytes.delete(rbId); const job: DeletionJob = { id: randomUUID(), userId, status: providerDelayed ? 'pending-provider' : 'complete', deleted, delayed: providerDelayed ? ['backup-lifecycle', 'model-provider'] : [], ...(providerDelayed ? {} : { completedAt: now() }) }; this.deletionJobs.set(job.id, job); this.audit('deletion-requested', userId, job.id, { status: job.status }); return structuredClone(job) }

  narrate(sessionId: Id, analysisId: Id, provider: (payload: string) => string): { text: string; mode: 'generated' | 'fallback'; versions: Record<string, string> } {
    const userId = this.requireSession(sessionId)
    const analysis = this.analyses.get(analysisId)
    if (!analysis || analysis.userId !== userId) throw new Error('Not found')
    const payload = JSON.stringify({ findings: analysis.findings, jurisdiction: analysis.versions.jurisdiction }).replace(/\b\d{9}\b/g, '[REDACTED]')
    const fallback = () => ({
      text: analysis.findings.map(finding => `${finding.title}. ${finding.suggestedAction}. Limitations: ${finding.limitations.join('; ')}`).join('\n') || 'No publishable findings were produced.',
      mode: 'fallback' as const,
      versions: { model: 'none', prompt: 'deterministic@1', retrieval: 'approved-content@1', application: applicationVersion },
    })
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const text = provider(payload)
        if (validateNarration(text, analysis)) {
          assertSafeConsumerOutput(text)
          return { text, mode: 'generated', versions: { model: 'configured-provider', prompt: 'narration@1', retrieval: 'approved-content@1', application: applicationVersion } }
        }
      } catch {
        // Retry once with the same constrained structured payload, then fall back.
      }
    }
    const fallbackResult = fallback()
    assertSafeConsumerOutput(fallbackResult.text)
    return fallbackResult
  }

  recordPilotApproval(input: { area: PilotApprovalArea; approver: string; evidenceReference: string }): PilotApproval {
    if (!input.approver.trim() || !input.evidenceReference.trim()) throw new Error('Approval requires an accountable approver and evidence reference')
    const approval = { ...input, approvedAt: now() }
    this.pilotApprovals.set(input.area, approval)
    this.audit('pilot-approval-recorded', input.approver, input.area, { evidenceReference: input.evidenceReference })
    return structuredClone(approval)
  }
  recordPilotDrill(input: { scenario: string; owner: string; result: PilotDrillResult; gaps: string[]; followUpTicket: string }): PilotDrill {
    if (!input.scenario.trim() || !input.owner.trim() || !input.followUpTicket.trim()) throw new Error('Pilot drill requires scenario, owner, and follow-up ticket')
    const drill: PilotDrill = { id: randomUUID(), ...input, gaps: [...input.gaps], recordedAt: now() }
    this.pilotDrills.push(drill)
    this.audit('pilot-drill-recorded', input.owner, drill.id, { scenario: input.scenario, result: input.result, followUpTicket: input.followUpTicket })
    return structuredClone(drill)
  }
  getPilotDrills(): PilotDrill[] {
    return this.pilotDrills.map(item => structuredClone(item))
  }
  getPilotDrillEvidenceReport(): PilotDrillEvidenceReport {
    const outcomes: Record<PilotDrillResult, number> = {
      passed: 0,
      'passed-with-gaps': 0,
      blocked: 0,
    }
    const openGaps: PilotDrillEvidenceGap[] = []
    const followUpTickets = new Set<string>()

    for (const drill of this.pilotDrills) {
      outcomes[drill.result] += 1
      followUpTickets.add(drill.followUpTicket)
      if (drill.result !== 'passed') {
        openGaps.push({
          scenario: drill.scenario,
          owner: drill.owner,
          result: drill.result,
          gaps: [...drill.gaps],
          followUpTicket: drill.followUpTicket,
        })
      }
    }

    return {
      generatedAt: now(),
      totalDrills: this.pilotDrills.length,
      outcomes,
      openGaps,
      followUpTickets: [...followUpTickets],
    }
  }
  getPilotEvidenceBundle(input: { comprehension: ComprehensionEvidenceReport; accessibility: AccessibilityEvidenceReport; narration?: NarrationEvaluation }): PilotEvidenceBundle {
    const pilotGate = this.getPilotGate()
    const quality = this.getQualityReport()
    const drills = this.getPilotDrillEvidenceReport()
    const failingEvidenceSurfaces: PilotEvidenceSummary['failingEvidenceSurfaces'] = []
    if (!input.comprehension.passed) failingEvidenceSurfaces.push('comprehension')
    if (!input.accessibility.passed) failingEvidenceSurfaces.push('accessibility')
    if (drills.openGaps.length > 0) failingEvidenceSurfaces.push('drills')
    if (input.narration && !input.narration.safe) failingEvidenceSurfaces.push('narration')
    return {
      generatedAt: now(),
      pilotGate,
      quality,
      drills,
      comprehension: structuredClone(input.comprehension),
      accessibility: structuredClone(input.accessibility),
      ...(input.narration ? { narration: structuredClone(input.narration) } : {}),
      summary: {
        openApprovalAreas: [...pilotGate.missing],
        failingEvidenceSurfaces,
      },
    }
  }
  renderPilotReviewerMarkdown(input: { comprehension: ComprehensionEvidenceReport; accessibility: AccessibilityEvidenceReport; narration?: NarrationEvaluation }): string {
    const bundle = this.getPilotEvidenceBundle(input)
    const lines = [
      '# Pilot reviewer export',
      '',
      `Generated at: ${bundle.generatedAt}`,
      `Pilot gate: ${bundle.pilotGate.ready ? 'ready' : 'not ready'}`,
      `Open approval areas: ${bundle.summary.openApprovalAreas.length > 0 ? bundle.summary.openApprovalAreas.join(', ') : 'none'}`,
      `Failing evidence surfaces: ${bundle.summary.failingEvidenceSurfaces.length > 0 ? bundle.summary.failingEvidenceSurfaces.join(', ') : 'none'}`,
      '',
      '## Approvals',
      '',
      ...(bundle.pilotGate.approvals.length > 0
        ? bundle.pilotGate.approvals.map(approval => `- ${approval.area}: ${approval.approver} (${approval.evidenceReference})`)
        : ['- None.']),
      '',
      '## Evidence surfaces',
      '',
      `- Comprehension: ${bundle.comprehension.passed ? 'passing' : 'failing'} (${bundle.comprehension.coverage.passedChecks}/${bundle.comprehension.coverage.totalChecks} checks passed${bundle.comprehension.missing.length > 0 ? `; missing: ${bundle.comprehension.missing.join(', ')}` : ''})`,
      `- Accessibility: ${bundle.accessibility.passed ? 'passing' : 'failing'} (${bundle.accessibility.coverage.passedChecks}/${bundle.accessibility.coverage.totalChecks} checks passed${bundle.accessibility.missing.length > 0 ? `; missing: ${bundle.accessibility.missing.join(', ')}` : ''})`,
      `- Drills: ${bundle.drills.openGaps.length === 0 ? 'passing' : 'failing'} (${bundle.drills.totalDrills} recorded; open gaps: ${bundle.drills.openGaps.length})`,
      `- Quality: ${bundle.quality.segments.length} segment${bundle.quality.segments.length === 1 ? '' : 's'} recorded`,
      ...(bundle.narration
        ? [`- Narration: ${bundle.narration.safe ? 'passing' : 'failing'}${bundle.narration.safe ? '' : ` (violations: ${bundle.narration.violations.join(', ')})`}`]
        : []),
      '',
      '## Drill follow-ups',
      '',
      ...(bundle.drills.openGaps.length > 0
        ? bundle.drills.openGaps.map(gap => `- ${gap.scenario} — ${gap.result} — owner: ${gap.owner} — follow-up: ${gap.followUpTicket}`)
        : ['- None.']),
    ]
    return lines.join('\n')
  }
  renderPilotReviewerJson(input: { comprehension: ComprehensionEvidenceReport; accessibility: AccessibilityEvidenceReport; narration?: NarrationEvaluation }): string {
    const bundle = this.getPilotEvidenceBundle(input)
    return JSON.stringify({ ...bundle, markdown: this.renderPilotReviewerMarkdown(input) }, null, 2)
  }
  getPilotGate(): PilotGate {
    const required: PilotApprovalArea[] = ['product', 'legal', 'privacy', 'security', 'operations', 'accessibility', 'vendor']
    const missing = required.filter(area => !this.pilotApprovals.has(area))
    return {
      ready: missing.length === 0 && !!this.launchScope,
      missing,
      approvals: [...this.pilotApprovals.values()].map(item => structuredClone(item)),
      ...(this.launchScope ? { launchScope: structuredClone(this.launchScope) } : {}),
      missingLaunchScope: !this.launchScope,
    }
  }
  assertRealConsumerPilotReady(): void {
    const gate = this.getPilotGate()
    if (gate.missingLaunchScope) throw new Error('Pilot launch scope is not configured')
    if (!gate.ready) throw new Error(`Pilot approvals incomplete: ${gate.missing.join(', ')}`)
  }
  private recordTimestamp(subjectId: Id, patch: Partial<TimestampRecord>): void {
    const existing = this.timelineBySubject.get(subjectId) ?? {}
    this.timelineBySubject.set(subjectId, { ...existing, ...patch })
  }

  private getLatencySummary(values: number[]): QualityLatencySummary {
    if (values.length === 0) return { sampleSize: 0, averageMs: 0, maxMs: 0 }
    const total = values.reduce((sum, value) => sum + value, 0)
    return { sampleSize: values.length, averageMs: total / values.length, maxMs: Math.max(...values) }
  }

  getQualityReport(): QualityReport {
    const segments = new Map<string, QualityReportSegment>()

    const getSegment = (provider: string, documentType: 'pdf' | 'html', jurisdiction: Jurisdiction): QualityReportSegment => {
      const key = `${provider}|${documentType}|${jurisdiction}`
      const existing = segments.get(key)
      if (existing) return existing
      const created: QualityReportSegment = {
        provider,
        documentType,
        jurisdiction,
        uploads: 0,
        parsedReports: 0,
        analyses: 0,
        findings: {
          total: 0,
          averagePerAnalysis: 0,
          bySeverity: { low: 0, medium: 0, high: 0 },
          byClassification: {
            'observed-fact': 0,
            'inconsistency': 0,
            'potential-error': 0,
            'verification-recommended': 0,
            'potential-compliance-concern': 0,
            'insufficient-information': 0,
            'educational-opportunity': 0,
          },
        },
        matching: {
          proposedGroups: 0,
          confirmedGroups: 0,
          highConfidenceProposals: 0,
          splitGroups: 0,
        },
        parser: {
          reportsWithTradelines: 0,
          averageTradelinesPerReport: 0,
        },
        latency: {
          uploadToParse: { sampleSize: 0, averageMs: 0, maxMs: 0 },
          parseToAnalysis: { sampleSize: 0, averageMs: 0, maxMs: 0 },
        },
      }
      segments.set(key, created)
      return created
    }

    const uploadToParseByKey = new Map<string, number[]>()
    const parseToAnalysisByKey = new Map<string, number[]>()
    const tradelineCountsByKey = new Map<string, number[]>()

    for (const upload of this.uploads.values()) {
      if (upload.stage !== 'ready-to-parse' || !upload.mediaType) continue
      const user = this.users.get(upload.userId)
      const jurisdiction = user?.consent?.analysisJurisdiction
      if (!jurisdiction) continue
      const provider = [...this.reports.values()].find(report => report.uploadId === upload.id)?.provider ?? 'unknown'
      const documentType = upload.mediaType === 'application/pdf' ? 'pdf' : 'html'
      const key = `${provider}|${documentType}|${jurisdiction}`
      getSegment(provider, documentType, jurisdiction).uploads += 1
      uploadToParseByKey.set(key, uploadToParseByKey.get(key) ?? [])
      parseToAnalysisByKey.set(key, parseToAnalysisByKey.get(key) ?? [])
      tradelineCountsByKey.set(key, tradelineCountsByKey.get(key) ?? [])
    }

    for (const report of this.reports.values()) {
      const upload = this.uploads.get(report.uploadId)
      if (!upload?.mediaType) continue
      const user = this.users.get(report.userId)
      const jurisdiction = user?.consent?.analysisJurisdiction
      if (!jurisdiction) continue
      const documentType = upload.mediaType === 'application/pdf' ? 'pdf' : 'html'
      const key = `${report.provider}|${documentType}|${jurisdiction}`
      const segment = getSegment(report.provider, documentType, jurisdiction)
      segment.parsedReports += 1
      if (report.tradelines.length > 0) segment.parser.reportsWithTradelines += 1
      ;(tradelineCountsByKey.get(key) ?? []).push(report.tradelines.length)
      const times = this.timelineBySubject.get(report.id)
      if (times?.uploadCompletedAt && times.reportParsedAt) {
        const delta = Date.parse(times.reportParsedAt) - Date.parse(times.uploadCompletedAt)
        if (Number.isFinite(delta) && delta >= 0) (uploadToParseByKey.get(key) ?? []).push(delta)
      }
    }

    for (const match of this.matches.values()) {
      const report = this.reports.get(match.reportId)
      if (!report) continue
      const upload = this.uploads.get(report.uploadId)
      if (!upload?.mediaType) continue
      const user = this.users.get(report.userId)
      const jurisdiction = user?.consent?.analysisJurisdiction
      if (!jurisdiction) continue
      const documentType = upload.mediaType === 'application/pdf' ? 'pdf' : 'html'
      const segment = getSegment(report.provider, documentType, jurisdiction)
      segment.matching.proposedGroups += 1
      if (match.confidence >= 0.9) segment.matching.highConfidenceProposals += 1
      if (match.state === 'confirmed') segment.matching.confirmedGroups += 1
      if (match.state === 'split' || match.confidence < 0.9) segment.matching.splitGroups += 1
    }

    for (const analysis of this.analyses.values()) {
      const report = this.reports.get(analysis.reportId)
      if (!report) continue
      const upload = this.uploads.get(report.uploadId)
      if (!upload?.mediaType) continue
      const jurisdiction = analysis.versions.jurisdiction as Jurisdiction
      const documentType = upload.mediaType === 'application/pdf' ? 'pdf' : 'html'
      const key = `${report.provider}|${documentType}|${jurisdiction}`
      const segment = getSegment(report.provider, documentType, jurisdiction)
      segment.analyses += 1
      segment.findings.total += analysis.findings.length
      for (const finding of analysis.findings) {
        segment.findings.bySeverity[finding.severity] += 1
        segment.findings.byClassification[finding.classification] += 1
      }
      const times = this.timelineBySubject.get(analysis.id)
      if (times?.reportParsedAt && times.analysisCreatedAt) {
        const delta = Date.parse(times.analysisCreatedAt) - Date.parse(times.reportParsedAt)
        if (Number.isFinite(delta) && delta >= 0) (parseToAnalysisByKey.get(key) ?? []).push(delta)
      }
    }

    for (const [key, segment] of segments.entries()) {
      segment.findings.averagePerAnalysis = segment.analyses === 0 ? 0 : segment.findings.total / segment.analyses
      const tradelineCounts = tradelineCountsByKey.get(key) ?? []
      segment.parser.averageTradelinesPerReport = tradelineCounts.length === 0 ? 0 : tradelineCounts.reduce((sum, value) => sum + value, 0) / tradelineCounts.length
      segment.latency.uploadToParse = this.getLatencySummary(uploadToParseByKey.get(key) ?? [])
      segment.latency.parseToAnalysis = this.getLatencySummary(parseToAnalysisByKey.get(key) ?? [])
    }

    return { generatedAt: now(), segments: [...segments.values()].map(segment => structuredClone(segment)) }
  }

  getAuditEvents(sessionId: Id): AuditEvent[] { const userId = this.requireSession(sessionId); return this.auditEvents.filter(event => event.actorId === userId).map(event => structuredClone(event)) }
  private requireSession(sessionId: Id): Id { const session = this.sessions.get(sessionId); if (!session || session.revokedAt) throw new Error('Authentication required'); return session.userId }
  private audit(type: string, actorId: Id, subjectId: Id, metadata: Record<string, string> = {}): void { this.auditEvents.push({ type, actorId, subjectId, at: now(), metadata }) }
}

type ParserInput = { provider: string; template: string; reportDate: string; identity: string[]; addresses: string[]; employers: string[]; inquiries: string[]; publicRecords: string[]; scores: number[]; remarks: string[]; tradelines: Array<{ bureau: Bureau; creditor: string; account: string; accountType: string; balance: number; status: string; opened: string; updated: string; confidence?: number }> }
function isParserInput(value: unknown): value is ParserInput { if (!value || typeof value !== 'object') return false; const item = value as Record<string, unknown>; return typeof item.provider === 'string' && typeof item.template === 'string' && typeof item.reportDate === 'string' && ['identity', 'addresses', 'employers', 'inquiries', 'publicRecords', 'scores', 'remarks', 'tradelines'].every(key => Array.isArray(item[key])) }

/** Run poppler `pdftotext -bbox` on raw PDF bytes → bbox HTML. (Production may swap to pdfjs-dist.) */
function extractBboxFromPdfBytes(bytes: Uint8Array): string {
  return execSync('pdftotext -bbox - -', { input: Buffer.from(bytes), encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
}

/** Map the parser's ProviderReport → the platform's CanonicalReport (bureaus kept separate; unknowns marked). */
function mapParserReportToCanonical(pr: ParserReport, userId: Id, uploadId: Id): CanonicalReport {
  const parserVersion = pr.template
  const toCanonical = <T>(pv: ParserValue<T>, currency?: 'USD'): CanonicalValue<T> => ({
    id: randomUUID(), bureau: pv.bureau as Bureau, field: pv.field, normalized: pv.normalized, originalDisplay: pv.originalDisplay,
    state: pv.state === 'known' ? 'known' : 'unknown', source: pv.source, extractionMethod: 'native-text', parserVersion, confidence: pv.confidence,
    ...(currency ? { currency } : {}),
  })
  const known = (bureau: Bureau, field: string, value: string): CanonicalValue<string> => ({
    id: randomUUID(), bureau, field, normalized: value, originalDisplay: value, state: 'known',
    source: { kind: 'page', locator: field, snippet: value.slice(0, 80) }, extractionMethod: 'native-text', parserVersion, confidence: 1,
  })
  const unknown = (bureau: Bureau, field: string): CanonicalValue<string> => ({
    id: randomUUID(), bureau, field, normalized: null, originalDisplay: '', state: 'unknown',
    source: { kind: 'page', locator: field, snippet: '' }, extractionMethod: 'native-text', parserVersion, confidence: 0,
  })
  const tradelines = pr.tradelines
    .filter(t => t.bureau === 'transunion' || t.bureau === 'experian' || t.bureau === 'equifax')
    .map((t): Tradeline => {
      const bureau = t.bureau as Bureau // filter above excluded 'unknown'; the PDF adapter only emits TU/EX/EQ
      return ({
        id: randomUUID(),
        creditor: known(bureau, 'creditor', t.creditor),
        maskedAccount: known(bureau, 'account', t.maskedAccount || '••••'),
        accountType: unknown(bureau, 'accountType'),
        balance: toCanonical(t.balance, 'USD'),
        status: toCanonical(t.status),
        opened: toCanonical(t.opened),
        updated: toCanonical(t.updated),
      })
    })
  return { id: randomUUID(), userId, uploadId, provider: pr.provider, template: pr.template, parserVersion, normalizedVersion: 1, reportDate: pr.reportDate ?? '', identity: [], addresses: [], employers: [], tradelines, collections: [], inquiries: [], publicRecords: [], scores: [], remarks: [], reviewComplete: false }
}
function allValues(report: CanonicalReport): CanonicalValue<unknown>[] { const direct: CanonicalValue<unknown>[] = [...report.identity, ...report.addresses, ...report.employers, ...report.inquiries, ...report.publicRecords, ...report.scores, ...report.remarks]; for (const line of [...report.tradelines, ...report.collections]) direct.push(line.creditor, line.maskedAccount, line.accountType, line.balance, line.status, line.opened, line.updated); return direct }
// severityRank removed — the engine's SEVERITY_RANK (imported) is used directly.
function validateNarration(text: string, analysis: Analysis): boolean { if (!text.trim() || /guarantee|will be deleted|illegal|violation|\b\d{9}\b|ignore previous|system prompt/i.test(text)) return false; return analysis.findings.every(finding => text.includes(finding.title) && finding.limitations.every(limitation => text.includes(limitation))) }
