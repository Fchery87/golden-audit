import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto'
import { applicationVersion } from '../../domain/src/index.js'
import { evaluateAnalysis, SEVERITY_RANK } from '../../analysis-core/src/index.js'
import { redactReportText } from '../../redaction/src/index.js'
import { assertSafeConsumerOutput, type NarrationEvaluation } from '../../output-guard/src/index.js'
import { parseIdentityIqPdfBytes } from '../../parser/src/index.js'
import type { ParserReport, ParserValue } from '../../parser/src/index.js'
import type { AccessibilityEvidenceReport } from '../../../apps/web/src/accessibility-report.js'
import type { ComprehensionEvidenceReport } from '../../../apps/web/src/comprehension-report.js'
import { InMemoryStore, InMemoryBlobStore, randomInviteCode, type PlatformStore, type BlobStore } from './store.js'
import type {
  Id, Jurisdiction, Bureau, Consent, AuthorizationRecord, LaunchScope, User, Session, Workspace,
  UploadStage, Upload, CanonicalValue, Tradeline, CanonicalReport, GovernanceStatus, GovernanceHistory,
  Authority, EducationModule, EducationModuleKind, ReviewedGovernanceCatalog, ReviewerRole, Reviewer, Rule, MatchGroup, Analysis, ActionItem,
  ReportFinding, CoverageRow, ParserFieldAvailability, ReportContent, ConsumerReport, ExportArtifact, DeletionJob, AuditEvent, PilotApprovalArea, PilotApproval, PilotGate,
  PilotDrillResult, PilotDrill, PilotDrillEvidenceGap, PilotDrillEvidenceReport, PilotEvidenceSummary,
  PilotApprovalRecordFile, QualityLatencySummary, QualityFindingSummary, QualityMatchingSummary,
  QualityParserSummary, QualityReportSegment, QualityReport,
} from './entities.js'

export type {
  Id, Jurisdiction, Bureau, Consent, AuthorizationRecord, LaunchScope, User, Session, Workspace,
  UploadStage, Upload, CanonicalValue, Tradeline, CanonicalReport, GovernanceStatus, GovernanceHistory,
  Authority, EducationModule, EducationModuleKind, ReviewedGovernanceCatalog, ReviewerRole, Reviewer, Rule, MatchGroup, Analysis, ActionItem,
  ReportFinding, CoverageRow, ParserFieldAvailability, ReportContent, ConsumerReport, ExportArtifact, DeletionJob, AuditEvent, PilotApprovalArea, PilotApproval, PilotGate,
  PilotDrillResult, PilotDrill, PilotDrillEvidenceGap, PilotDrillEvidenceReport, PilotEvidenceSummary,
  PilotApprovalRecordFile, QualityLatencySummary, QualityFindingSummary, QualityMatchingSummary,
  QualityParserSummary, QualityReportSegment, QualityReport,
}
export type { Finding, FindingClassification, RuleAudit, SourceReference } from './entities.js'
export type { PlatformStore, BlobStore } from './store.js'
export { InMemoryStore, InMemoryBlobStore, randomInviteCode } from './store.js'

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

/** D10 session hardening: idle timeout invalidates an inactive session even within the absolute window; the absolute cap forces re-authentication regardless of activity. */
export const SESSION_IDLE_TTL_MS = 24 * 60 * 60 * 1000
export const SESSION_ABSOLUTE_TTL_MS = 30 * 24 * 60 * 60 * 1000
/** D10 password-reset / email-verification token lifetime. */
export const TOKEN_TTL_MS = 60 * 60 * 1000

const now = () => new Date().toISOString()
const hashPassword = (password: string, salt: string) => scryptSync(password, salt, 32).toString('hex')
const maskAccount = (value: string) => `••••${value.replace(/\D/g, '').slice(-4)}`

function maskExportValue(value: unknown): unknown {
  if (typeof value === 'string') {
    const safe = value.replace(/No legal verdict/gi, 'No individual legal conclusion').replace(/legal violation/gi, 'legal conclusion')
    return /\d{5,}/.test(safe) ? maskAccount(safe) : safe
  }
  if (Array.isArray(value)) return value.map(maskExportValue)
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, maskExportValue(item)]))
  return value
}
function exportProjection(report: ConsumerReport) {
  const safe = maskExportValue({
    overview: report.overview,
    limitations: report.limitations.map(limitation => limitation.replace(/No legal verdict/gi, 'No individual legal conclusion').replace(/legal violation/gi, 'legal conclusion')),
    disclaimer: 'Educational information only; no specific outcome is promised.',
    findings: report.findings,
    content: report.content,
    generatedAt: report.generatedAt,
  })
  return safe
}

export class CreditAnalysisPlatform {
  private authorities = new Map<Id, Authority>()
  private modules = new Map<Id, EducationModule>()
  private rules = new Map<Id, Rule>()
  private publishedRulesets = new Map<string, Rule[]>()
  private publishedAuthorities = new Map<Id, Authority>()
  private publishedModules = new Map<Id, EducationModule>()
  private reviewers = new Map<Id, Reviewer>()
  private pilotApprovals = new Map<PilotApprovalArea, PilotApproval>()
  private pilotDrills: PilotDrill[] = []
  private launchScope: LaunchScope | undefined
  /** Ephemeral latency bookkeeping for quality reporting only — was never part of exportSnapshot
   *  either, so this is not a new cross-request durability gap introduced by the D5 rewrite. */
  private timelineBySubject = new Map<Id, { uploadCompletedAt?: string; reportParsedAt?: string; analysisCreatedAt?: string }>()

  private catalog: ReviewedGovernanceCatalog | undefined

  constructor(
    private store: PlatformStore = new InMemoryStore(),
    private blobStore: BlobStore = new InMemoryBlobStore(),
    catalog?: ReviewedGovernanceCatalog,
  ) {
    if (catalog) this.installReviewedCatalog(catalog)
  }

  // ------------------------------------------------------------------
  // Accounts / sessions / invites (D10)
  // ------------------------------------------------------------------

  async register(input: { email: string; password: string; inviteCode: string }): Promise<{ userId: Id; sessionId: Id }> {
    if (!/^\S+@\S+\.\S+$/.test(input.email)) throw new Error('A valid email is required')
    if (input.password.length < 12) throw new Error('Password must be at least 12 characters')
    const email = input.email.toLowerCase()
    if (await this.store.getUserByEmail(email)) throw new Error('Account already exists')
    // Mint the id and consume the invite with it BEFORE creating the user: consumeInvite is
    // single-use (atomic at the store layer), so this ordering means a failed/duplicate invite
    // never leaves an orphaned user record, and the invite's recorded usedByUserId is always
    // the real id — never a placeholder that a second call would be unable to correct.
    const userId = randomUUID()
    const consumed = await this.store.consumeInvite(input.inviteCode, userId, now())
    if (!consumed) throw new Error('Invite code is invalid or already used')
    const salt = randomBytes(16).toString('hex')
    const user: User = { id: userId, email, passwordSalt: salt, passwordHash: hashPassword(input.password, salt) }
    await this.store.createUser(user)
    const sessionId = await this.createSession(userId)
    await this.audit('account-registered', userId, userId, {})
    return { userId, sessionId }
  }

  async signIn(input: { email: string; password: string }): Promise<Id> {
    const user = await this.store.getUserByEmail(input.email.toLowerCase())
    if (!user) throw new Error('Invalid credentials')
    const actual = Buffer.from(hashPassword(input.password, user.passwordSalt), 'hex'); const expected = Buffer.from(user.passwordHash, 'hex')
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new Error('Invalid credentials')
    return this.createSession(user.id)
  }

  private async createSession(userId: Id): Promise<Id> {
    const id = randomUUID(); const at = now()
    const session: Session = { id, userId, createdAt: at, expiresAt: new Date(Date.now() + SESSION_ABSOLUTE_TTL_MS).toISOString(), lastUsedAt: at }
    await this.store.createSession(session)
    return id
  }
  async signOut(sessionId: Id): Promise<void> { await this.revokeSession(sessionId) }
  async revokeSession(sessionId: Id): Promise<void> {
    const session = await this.store.getSession(sessionId); if (!session) return
    session.revokedAt = now(); await this.store.updateSession(session)
    await this.audit('session-revoked', session.userId, sessionId, {})
  }
  async revokeOtherSessions(sessionId: Id): Promise<void> {
    const actor = await this.requireSession(sessionId)
    for (const session of await this.store.listActiveSessionsForUser(actor)) if (session.id !== sessionId) await this.revokeSession(session.id)
  }

  /** Issues a single-use invite code (invite-only pilot — no HTTP route exposes this; operators mint codes out of band). */
  async issueInvite(): Promise<string> {
    const code = randomInviteCode()
    await this.store.createInvite(code, now())
    return code
  }

  async requestPasswordReset(email: string): Promise<{ userId: Id; token: string } | undefined> {
    const user = await this.store.getUserByEmail(email.toLowerCase())
    if (!user) return undefined
    const token = randomBytes(24).toString('base64url')
    await this.store.createToken('password-reset', token, user.id, new Date(Date.now() + TOKEN_TTL_MS).toISOString())
    return { userId: user.id, token }
  }
  async resetPassword(token: string, newPassword: string): Promise<void> {
    if (newPassword.length < 12) throw new Error('Password must be at least 12 characters')
    const consumed = await this.store.consumeToken('password-reset', token)
    if (!consumed) throw new Error('Reset token is invalid or expired')
    const salt = randomBytes(16).toString('hex')
    await this.store.updateUserPassword(consumed.userId, hashPassword(newPassword, salt), salt)
    // Session rotation on privilege change (D10): a password reset invalidates every existing session.
    for (const session of await this.store.listActiveSessionsForUser(consumed.userId)) await this.revokeSession(session.id)
    await this.audit('password-reset', consumed.userId, consumed.userId, {})
  }

  async requestEmailVerification(sessionId: Id): Promise<{ token: string }> {
    const userId = await this.requireSession(sessionId)
    const token = randomBytes(24).toString('base64url')
    await this.store.createToken('email-verify', token, userId, new Date(Date.now() + TOKEN_TTL_MS).toISOString())
    return { token }
  }
  async verifyEmail(token: string): Promise<void> {
    const consumed = await this.store.consumeToken('email-verify', token)
    if (!consumed) throw new Error('Verification token is invalid or expired')
    await this.store.markEmailVerified(consumed.userId, now())
    await this.audit('email-verified', consumed.userId, consumed.userId, {})
  }

  // ------------------------------------------------------------------
  // Consent / authorization
  // ------------------------------------------------------------------

  async recordConsent(sessionId: Id, input: Omit<Consent, 'acceptedAt'>): Promise<Workspace> {
    const userId = await this.requireSession(sessionId)
    if (!input.adultUSConsumer || !input.authorizedReportUse || !input.educationalLimitations || !input.sensitiveDataHandling) throw new Error('All required acknowledgements are required')
    if (!this.launchScope) throw new Error('Launch scope is not configured for the pilot')
    if (!this.launchScope.approvedStates.includes(input.residence) || !this.launchScope.approvedStates.includes(input.analysisJurisdiction)) throw new Error('Jurisdiction is not enabled for the pilot')
    const user = await this.store.getUserById(userId); if (!user) throw new Error('User not found')
    const consent: Consent = { ...input, acceptedAt: now() }
    await this.store.updateUserConsent(userId, consent)
    const workspace: Workspace = { id: randomUUID(), userId, createdAt: now() }
    await this.store.createWorkspace(workspace)
    await this.audit('consent-recorded', userId, workspace.id, { version: input.version, jurisdiction: input.analysisJurisdiction })
    return workspace
  }

  async acceptAuthorization(sessionId: Id, acknowledgement: { version: string; accepted: boolean } = { version: AUTHORIZATION_VERSION, accepted: true }): Promise<AuthorizationRecord> {
    const userId = await this.requireSession(sessionId)
    if (!acknowledgement.accepted || acknowledgement.version !== AUTHORIZATION_VERSION) throw new Error('Current written authorization must be affirmatively accepted')
    const record: AuthorizationRecord = { id: randomUUID(), userId, version: AUTHORIZATION_VERSION, acceptedAt: now() }
    await this.store.createAuthorization(record)
    await this.audit('authorization-accepted', userId, record.id, { version: AUTHORIZATION_VERSION })
    return structuredClone(record)
  }
  async getAuthorization(sessionId: Id): Promise<AuthorizationRecord> {
    const userId = await this.requireSession(sessionId)
    const record = await this.store.getAuthorizationByUser(userId)
    if (!record) throw new Error('No written authorization on record')
    return structuredClone(record)
  }
  getRetentionPolicy(): typeof RETENTION_POLICY { return RETENTION_POLICY }
  getDisclosure() { return { authorizationVersion: AUTHORIZATION_VERSION, authorizationText: AUTHORIZATION_TEXT, retentionPolicy: RETENTION_POLICY } }
  async getConsumerDashboard(sessionId: Id) {
    const userId = await this.requireSession(sessionId)
    const user = await this.store.getUserById(userId); if (!user) throw new Error('Not found')
    const workspaces = await this.store.listWorkspacesForUser(userId)
    const reports = await this.store.listConsumerReportsForUser(userId)
    const pending = (await this.store.listReportsForUser(userId)).reverse()
    const pendingReview = await (async () => {
      for (const candidate of pending) {
        const matches = await this.store.listMatchesByReport(candidate.id)
        const unresolved = matches.filter(match => match.state !== 'confirmed' && match.state !== 'rejected')
        if (unresolved.length > 0) return { status: 'match-review-required' as const, reportId: candidate.id, matches: unresolved, tradelines: candidate.tradelines.map(line => ({ id: line.id, bureau: String(line.creditor.bureau), creditor: line.creditor.normalized ?? '', maskedAccount: line.maskedAccount.normalized ?? '', balanceCents: line.balance.normalized ?? null })) }
      }
      return null
    })()
    return { email: user.email, workspaceId: workspaces[0]?.id ?? null, consent: !!user.consent, authorization: !!(await this.store.getAuthorizationByUser(userId)), pendingReview, reports: await Promise.all(reports.map(async report => ({ id: report.id, generatedAt: report.generatedAt, findingCount: report.findings.length, parserVersion: report.content?.parserVersion ?? 'legacy', exportId: (await this.store.findExportByReport(userId, report.id))?.id ?? null }))) }
  }
  private async requireAuthorization(userId: Id): Promise<void> {
    if (!(await this.store.getAuthorizationByUser(userId))) throw new Error('Written authorization required before processing')
  }

  // ------------------------------------------------------------------
  // Launch scope (operator config — stays in-memory, re-seeded per instantiation)
  // ------------------------------------------------------------------

  configureLaunchScope(input: Omit<LaunchScope, 'configuredAt'>): LaunchScope {
    if (input.mode === 'one-state-free-pilot') {
      if (input.approvedStates.length !== 1) throw new Error('One-state pilot requires exactly one approved state')
      if (!input.provisionalSelectedState || input.provisionalSelectedState !== input.approvedStates[0]) throw new Error('One-state pilot requires a matching provisional selected state')
    }
    if (!input.approvedStates.length && input.mode !== 'launch-paused-pending-review') throw new Error('At least one approved state is required unless launch is paused')
    if (!input.stateSelectionEvidenceReference.trim() || !input.availabilityClaim.trim() || !input.notes.trim()) throw new Error('Launch scope requires evidence, availability claim, and notes')
    const scope: LaunchScope = { ...input, approvedStates: [...new Set(input.approvedStates)], configuredAt: now() }
    this.launchScope = scope
    void this.audit('launch-scope-configured', 'system', scope.provisionalSelectedState ?? 'launch-scope', { mode: scope.mode, approvedStates: scope.approvedStates.join(',') })
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
    return this.configureLaunchScope({
      mode: input.launchScope.mode,
      approvedStates,
      ...(provisionalSelectedState ? { provisionalSelectedState } : {}),
      stateSelectionEvidenceReference: input.launchScope.stateSelectionEvidenceReference,
      availabilityClaim: input.launchScope.availabilityClaim,
      pricingMode: input.launchScope.pricingMode,
      nationwideStatus: input.launchScope.nationwideStatus,
      notes: input.launchScope.notes,
    })
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

  // ------------------------------------------------------------------
  // Uploads / parsing
  // ------------------------------------------------------------------

  async getWorkspace(sessionId: Id, workspaceId: Id): Promise<Workspace> {
    const userId = await this.requireSession(sessionId)
    const workspace = await this.store.getWorkspace(workspaceId)
    if (!workspace || workspace.userId !== userId) throw new Error('Not found')
    return structuredClone(workspace)
  }

  async initializeUpload(sessionId: Id, workspaceId: Id, ttlMs = 300_000): Promise<Upload> {
    const userId = await this.requireSession(sessionId)
    const workspace = await this.getWorkspace(sessionId, workspaceId)
    const user = await this.store.getUserById(userId)
    if (!user?.consent) throw new Error('Consent gate incomplete')
    const upload: Upload = { id: randomUUID(), userId, workspaceId: workspace.id, token: randomBytes(24).toString('base64url'), tokenExpiresAt: new Date(Date.now() + ttlMs).toISOString(), stage: 'initialized' }
    await this.store.saveUpload(upload)
    return structuredClone(upload)
  }

  async completeUpload(input: { uploadId: Id; token: string; fileName: string; mediaType: string; bytes: Uint8Array }): Promise<Upload> {
    const upload = await this.store.getUpload(input.uploadId)
    if (!upload || upload.token !== input.token) throw new Error('Upload authorization invalid')
    if (Date.parse(upload.tokenExpiresAt) <= Date.now()) throw new Error('Upload authorization expired')
    if (upload.completedAt) return structuredClone(upload)
    await this.requireAuthorization(upload.userId) // FCRA counsel Q-L3: written authorization required before any processing
    upload.stage = 'scanning'
    const content = Buffer.from(input.bytes); const lowerName = input.fileName.toLowerCase(); const isPdf = input.mediaType === 'application/pdf' && lowerName.endsWith('.pdf') && content.subarray(0, 5).toString() === '%PDF-'
    const isHtml = input.mediaType === 'text/html' && lowerName.endsWith('.html') && /^\s*<(?:!doctype html|html)/i.test(content.toString('utf8'))
    if (!isPdf && !isHtml) return this.failUpload(upload, 'final-failure', 'Unsupported or mismatched report format')
    if (content.byteLength > 5_000_000) return this.failUpload(upload, 'final-failure', 'Report exceeds processing limits')
    if (/\/Encrypt\b/i.test(content.toString('latin1'))) return this.failUpload(upload, 'final-failure', 'Password-protected PDFs are not supported')
    // The EICAR/script/iframe/URL guard is an HTML-injection defense; it must not run on raw PDF bytes
    // (binary PDFs legitimately contain URL-like byte sequences). PDF structural safety is covered above.
    if (!isPdf) { const raw = content.toString('utf8'); if (/EICAR|<script|javascript:|<iframe|https?:\/\//i.test(raw)) return this.failUpload(upload, 'quarantined', 'The report could not be processed safely', 'unsafe') }
    const sourceHash = createHash('sha256').update(content).digest('hex'); const hashKey = `${upload.userId}:${sourceHash}`
    const existingId = await this.store.getUploadIdByHash(hashKey)
    if (existingId && existingId !== upload.id) { const existing = await this.store.getUpload(existingId); return structuredClone(existing ?? upload) }
    upload.fileName = input.fileName; upload.mediaType = isPdf ? 'application/pdf' : 'text/html'; upload.size = content.byteLength; upload.sourceHash = sourceHash; upload.scanResult = 'clean'; upload.retentionClass = 'consumer-report'; upload.stage = 'ready-to-parse'
    if (isPdf) { await this.blobStore.put(upload.id, content) } else { const raw = content.toString('utf8'); const sanitized = raw.replace(/<script[\s\S]*?<\/script>/gi, ''); const { redacted, redactions } = redactReportText(sanitized); upload.sanitizedContent = redacted; upload.redactionCount = redactions }
    upload.completedAt = now()
    await this.store.saveUpload(upload, hashKey)
    this.recordTimestamp(upload.id, { uploadCompletedAt: upload.completedAt })
    await this.audit('upload-completed', upload.userId, upload.id, { mediaType: upload.mediaType, sourceHash })
    return structuredClone(upload)
  }

  private async failUpload(upload: Upload, stage: UploadStage, message: string, scanResult?: 'unsafe'): Promise<Upload> {
    upload.stage = stage; upload.failureMessage = message; if (scanResult) upload.scanResult = scanResult
    await this.store.saveUpload(upload)
    await this.audit(stage === 'quarantined' ? 'upload-quarantined' : 'upload-failed', upload.userId, upload.id, {})
    return structuredClone(upload)
  }

  async parseReport(sessionId: Id, uploadId: Id): Promise<CanonicalReport> {
    const userId = await this.requireSession(sessionId)
    const upload = await this.store.getUpload(uploadId)
    if (!upload || upload.userId !== userId) throw new Error('Not found')
    if (upload.stage !== 'ready-to-parse') throw new Error('Upload is not parseable')
    if (upload.mediaType === 'application/pdf') return this.parseIdentityIqPdf(upload, userId)
    if (!upload.sanitizedContent) throw new Error('Upload is not parseable')
    const marker = 'GOLDEN-AUDIT-REPORT:'; const markerIndex = upload.sanitizedContent.indexOf(marker); if (markerIndex < 0) throw new Error('Unsupported report provider or template')
    const json = upload.sanitizedContent.slice(markerIndex + marker.length).replace(/<\/body>[\s\S]*/i, '').replace(/%%EOF[\s\S]*/i, '').trim(); const input: unknown = JSON.parse(json)
    if (!isParserInput(input)) throw new Error('Report schema validation failed')
    const parserVersion = 'fixture-adapter@1'; const extractionMethod = 'html-selector' // synthetic-fixture path is HTML-only (PDFs route to the real adapter)
    const makeValue = <T>(bureau: Bureau, field: string, normalized: T | null, originalDisplay: string, locator: string, confidence = 1): CanonicalValue<T> => ({ id: randomUUID(), bureau, field, normalized, originalDisplay, state: normalized === null ? 'unknown' : 'known', source: { kind: 'element', locator, snippet: originalDisplay.slice(0, 80) }, extractionMethod, parserVersion, confidence })
    const tradelines = input.tradelines.map((line, index): Tradeline => {
      const confidence = line.confidence ?? 1
      const sliceValues = (field: string, values: string[]) => values.map((value, valueIndex) => makeValue(line.bureau, field, value, value, `${index}:${field}:${valueIndex}`, confidence))
      return { id: randomUUID(), creditor: makeValue(line.bureau, 'creditor', line.creditor, line.creditor, `${index}:creditor`), maskedAccount: makeValue(line.bureau, 'account', maskAccount(line.account), maskAccount(line.account), `${index}:account`), accountType: makeValue(line.bureau, 'accountType', line.accountType, line.accountType, `${index}:type`), balance: { ...makeValue(line.bureau, 'balance', line.balance, `$${(line.balance / 100).toFixed(2)}`, `${index}:balance`, confidence), currency: 'USD' }, creditLimit: { ...makeValue(line.bureau, 'creditLimit', line.creditLimit ?? null, line.creditLimit === undefined ? '' : `$${(line.creditLimit / 100).toFixed(2)}`, `${index}:credit-limit`, confidence), currency: 'USD' }, pastDue: { ...makeValue(line.bureau, 'pastDue', line.pastDue ?? null, line.pastDue === undefined ? '' : `$${(line.pastDue / 100).toFixed(2)}`, `${index}:past-due`, confidence), currency: 'USD' }, status: makeValue(line.bureau, 'status', line.status, line.status, `${index}:status`), opened: { ...makeValue(line.bureau, 'opened', line.opened, line.opened, `${index}:opened`), datePrecision: line.opened.length === 7 ? 'month' : 'day' }, updated: { ...makeValue(line.bureau, 'updated', line.updated, line.updated, `${index}:updated`), datePrecision: line.updated.length === 7 ? 'month' : 'day' }, dateOfFirstDelinquency: { ...makeValue(line.bureau, 'dateOfFirstDelinquency', line.dateOfFirstDelinquency ?? null, line.dateOfFirstDelinquency ?? '', `${index}:date-of-first-delinquency`, confidence), datePrecision: line.dateOfFirstDelinquency?.length === 7 ? 'month' : 'day' }, paymentHistory: (line.paymentHistory ?? []).map((cell, cellIndex) => ({ ...makeValue(line.bureau, 'paymentHistory', cell.status, cell.status, `${index}:payment-history:${cellIndex}`, confidence), yearMonth: cell.yearMonth })), remarks: sliceValues('remark', line.remarks ?? []), specialCommentCodes: sliceValues('specialCommentCode', line.specialCommentCodes ?? []) }
    })
    const firstBureau = input.tradelines[0]?.bureau ?? 'equifax'; const mapText = (items: string[], field: string) => items.map((value, i) => makeValue(firstBureau, field, value, value, `${field}:${i}`))
    const report: CanonicalReport = { id: randomUUID(), userId, uploadId, provider: input.provider, template: input.template, parserVersion, normalizedVersion: 1, reportDate: input.reportDate, identity: mapText(input.identity, 'identity'), addresses: mapText(input.addresses, 'address'), employers: mapText(input.employers, 'employer'), tradelines, collections: [], inquiries: mapText(input.inquiries, 'inquiry'), publicRecords: mapText(input.publicRecords, 'publicRecord'), scores: input.scores.map((score, i) => makeValue(firstBureau, 'score', score, String(score), `score:${i}`)), remarks: mapText(input.remarks, 'remark'), reviewComplete: false }
    const parsedAt = now()
    await this.store.saveReport(report)
    this.recordTimestamp(report.id, { reportParsedAt: parsedAt, ...(upload.completedAt ? { uploadCompletedAt: upload.completedAt } : {}) })
    await this.audit('report-parsed', userId, report.id, { parserVersion })
    return structuredClone(report)
  }

  async reviewValue(sessionId: Id, reportId: Id, valueId: Id, input: { decision: import('./entities.js').ReviewDecision; reason: string; replacement?: string | number }): Promise<CanonicalReport> {
    const userId = await this.requireSession(sessionId)
    const report = await this.store.getReport(reportId); if (!report || report.userId !== userId) throw new Error('Not found')
    const value = allValues(report).find(item => item.id === valueId); if (!value) throw new Error('Value not found')
    value.review = { decision: input.decision, reason: input.reason, actorId: userId, at: now(), ...(input.replacement !== undefined ? { replacement: input.replacement } : {}) }
    report.normalizedVersion += 1
    await this.store.saveReport(report)
    await this.audit('report-value-reviewed', userId, valueId, { decision: input.decision })
    return structuredClone(report)
  }
  async completeReview(sessionId: Id, reportId: Id): Promise<void> {
    const userId = await this.requireSession(sessionId)
    const report = await this.store.getReport(reportId); if (!report || report.userId !== userId) throw new Error('Not found')
    report.reviewComplete = true
    await this.store.saveReport(report)
  }

  /** REAL IdentityIQ PDF path: bytes → pdfjs (unpdf) → parser → canonical report. No child_process, no native binary — Workers-safe. */
  private async parseIdentityIqPdf(upload: Upload, userId: Id): Promise<CanonicalReport> {
    const bytes = await this.blobStore.get(upload.id)
    if (!bytes) throw new Error('Report bytes unavailable; re-upload required')
    const parsed = await parseIdentityIqPdfBytes(bytes)
    if (parsed.tradelines.length === 0) throw new Error('Unsupported report provider or template') // reject rather than guess
    const report = mapParserReportToCanonical(parsed, userId, upload.id)
    const parsedAt = now()
    await this.store.saveReport(report)
    this.recordTimestamp(report.id, { reportParsedAt: parsedAt, ...(upload.completedAt ? { uploadCompletedAt: upload.completedAt } : {}) })
    await this.audit('report-parsed', userId, report.id, { parserVersion: report.parserVersion })
    return structuredClone(report)
  }
  async getSourceSnippet(sessionId: Id, reportId: Id, valueId: Id) {
    const userId = await this.requireSession(sessionId)
    const report = await this.store.getReport(reportId); if (!report || report.userId !== userId) throw new Error('Not found')
    const value = allValues(report).find(item => item.id === valueId); if (!value) throw new Error('Not found')
    return structuredClone(value.source)
  }

  // ------------------------------------------------------------------
  // Governance (operator config — stays in-memory, re-seeded per instantiation)
  // ------------------------------------------------------------------

  installReviewedCatalog(catalog: ReviewedGovernanceCatalog): void {
    if (this.catalog) return
    const contentForDigest = { ...catalog, approval: undefined }
    const catalogDigest = createHash('sha256').update(JSON.stringify(contentForDigest)).digest('hex')
    if (catalog.approval.approvedByGitIdentity !== 'fchery87' || catalog.approval.reviewedCommit === 'PENDING' || catalog.approval.catalogSha256 !== catalogDigest) throw new Error('Reviewed content approval does not match this catalog')
    if (catalog.approval.reviewIntervalDays !== 90 || Date.parse(catalog.approval.reReviewDueAt) - Date.parse(catalog.approval.approvedAt) !== 90 * 24 * 60 * 60 * 1000) throw new Error('Reviewed content has an invalid re-review interval')
    if (Date.parse(catalog.approval.reReviewDueAt) < Date.now()) throw new Error('Reviewed content is overdue for re-review')
    const authorityIds = new Set(catalog.authorities.map(item => item.id))
    const moduleIds = new Set(catalog.modules.map(item => item.id))
    if (authorityIds.size !== catalog.authorities.length || moduleIds.size !== catalog.modules.length) throw new Error('Reviewed content has duplicate identifiers')
    for (const authority of catalog.authorities) {
      if (authority.status !== 'published' || !authority.title || !authority.sourceUrl || !/^https:\/\//.test(authority.sourceUrl)) throw new Error('Reviewed authority is incomplete')
      assertSafeConsumerOutput(`${authority.title}\n${authority.citation}\n${authority.limitations.join('\n')}`)
    }
    for (const module of catalog.modules) {
      if (module.status !== 'published' || !module.authorityIds?.length || !module.authorityIds.every(id => authorityIds.has(id))) throw new Error('Reviewed module has an unknown authority')
      assertSafeConsumerOutput(`${module.title}\n${module.body}\n${module.limitations.join('\n')}`)
    }
    for (const rule of catalog.rules) {
      if (rule.status !== 'published' || !rule.requiredInputs.length || !rule.testCases.length || !rule.authorityIds.every(id => authorityIds.has(id)) || !rule.educationModuleIds.every(id => moduleIds.has(id))) throw new Error('Reviewed rule contract is incomplete')
      assertSafeConsumerOutput(`${rule.name}\n${rule.requiredInputs.join('\n')}\n${rule.limitations.join('\n')}`)
    }
    const version = createHash('sha256').update(JSON.stringify(catalog.rules)).digest('hex').slice(0, 12)
    const rules = catalog.rules.map(rule => ({ ...structuredClone(rule), version }))
    this.catalog = structuredClone(catalog)
    for (const authority of catalog.authorities) { this.authorities.set(authority.id, structuredClone(authority)); this.publishedAuthorities.set(authority.id, structuredClone(authority)) }
    for (const module of catalog.modules) { this.modules.set(module.id, structuredClone(module)); this.publishedModules.set(module.id, structuredClone(module)) }
    for (const rule of rules) this.rules.set(rule.id, structuredClone(rule))
    this.publishedRulesets.set(version, rules)
  }

  getReviewedCatalogVersion(): string | undefined { return this.catalog?.catalogVersion }

  registerReviewer(input: Reviewer): void { this.reviewers.set(input.id, structuredClone(input)) }
  private requireReviewer(reviewerId: Id, roles: ReviewerRole[]): Reviewer { const reviewer = this.reviewers.get(reviewerId); if (!reviewer || !roles.includes(reviewer.role)) throw new Error('Reviewer is not authorized'); return reviewer }
  createAuthority(reviewerId: Id, input: Omit<Authority, 'id' | 'status' | 'history'>): Authority { this.requireReviewer(reviewerId, ['compliance-reviewer']); const item = { ...input, title: input.title ?? 'Documentation basis', sourceUrl: input.sourceUrl ?? 'https://www.consumerfinance.gov/', id: randomUUID(), status: 'draft' as const, history: [] }; this.authorities.set(item.id, item); return structuredClone(item) }
  createEducationModule(reviewerId: Id, input: Omit<EducationModule, 'id' | 'status' | 'history'>): EducationModule { this.requireReviewer(reviewerId, ['compliance-reviewer']); const item = { ...input, kind: input.kind ?? 'finding-module' as const, section: input.section ?? 'finding' as const, authorityIds: input.authorityIds ?? [], id: randomUUID(), status: 'draft' as const, history: [] }; this.modules.set(item.id, item); return structuredClone(item) }
  createRule(reviewerId: Id, input: Omit<Rule, 'id' | 'status' | 'history'>): Rule { this.requireReviewer(reviewerId, ['engineering-reviewer']); if (!input.requiredInputs.length || !input.testCases.length) throw new Error('Rule contract is incomplete'); const item = { ...input, id: randomUUID(), status: 'draft' as const, history: [] }; this.rules.set(item.id, item); return structuredClone(item) }
  reviewGovernance(kind: 'authority' | 'module' | 'rule', id: Id, reviewerId: Id, action: Exclude<GovernanceStatus, 'draft'> | 'revision-requested', reason: string): void { this.requireReviewer(reviewerId, ['compliance-reviewer', 'engineering-reviewer']); const map = kind === 'authority' ? this.authorities : kind === 'module' ? this.modules : this.rules; const item = map.get(id); if (!item) throw new Error('Governance item not found'); item.history.push({ action, reviewerId, at: now(), reason }); if (action !== 'revision-requested') item.status = action; void this.audit(`governance-${action}`, reviewerId, id, { kind, reason }) }
  publishRuleset(reviewerId: Id, jurisdiction: Jurisdiction, effectiveDate: string): string { this.requireReviewer(reviewerId, ['release-manager']); const rules = [...this.rules.values()].filter(rule => rule.status === 'approved' && rule.jurisdiction === jurisdiction && rule.effectiveFrom <= effectiveDate && rule.authorityIds.every(id => this.authorities.get(id)?.status === 'approved') && rule.educationModuleIds.every(id => this.modules.get(id)?.status === 'approved')); if (!rules.length) throw new Error('No approved rules available'); for (const rule of rules) { const authorities = rule.authorityIds.map(id => this.authorities.get(id)); const modules = rule.educationModuleIds.map(id => this.modules.get(id)); if (authorities.some(authority => !authority?.title || !authority.sourceUrl || !/^https:\/\//.test(authority.sourceUrl)) || modules.some(module => !module)) throw new Error('Published consumer content is incomplete'); assertSafeConsumerOutput(`${rule.name}\n${rule.requiredInputs.join('\n')}\n${rule.limitations.join('\n')}\n${authorities.flatMap(authority => authority ? [authority.title ?? '', authority.citation] : []).join('\n')}\n${modules.flatMap(module => module ? [module.title, module.body, ...module.limitations] : []).join('\n')}`) } const version = createHash('sha256').update(JSON.stringify(rules)).digest('hex').slice(0, 12); const published = structuredClone(rules).map(rule => ({ ...rule, status: 'published' as const, version })); this.publishedRulesets.set(version, published); for (const rule of rules) rule.status = 'published'; for (const rule of rules) for (const id of rule.authorityIds) { const authority = this.authorities.get(id); if (authority) { authority.status = 'published'; this.publishedAuthorities.set(id, structuredClone(authority)) } } for (const rule of rules) for (const id of rule.educationModuleIds) { const module = this.modules.get(id); if (module) { module.status = 'published'; this.publishedModules.set(id, structuredClone(module)) } } void this.audit('ruleset-published', reviewerId, version, { jurisdiction }); return version }
  disableGovernance(kind: 'authority' | 'module' | 'rule', id: Id, reviewerId: Id, reason: string): void { this.requireReviewer(reviewerId, ['compliance-reviewer', 'release-manager']); this.reviewGovernance(kind, id, reviewerId, 'disabled', reason) }
  getEffectiveRules(jurisdiction: Jurisdiction, effectiveDate: string): Rule[] { return [...this.publishedRulesets.values()].flat().filter(rule => rule.jurisdiction === jurisdiction && rule.effectiveFrom <= effectiveDate && rule.status === 'published' && rule.authorityIds.every(id => this.authorities.get(id)?.status !== 'disabled') && rule.educationModuleIds.every(id => this.modules.get(id)?.status !== 'disabled')).map(rule => structuredClone(rule)) }
  getEffectiveAuthorities(jurisdiction: Jurisdiction, effectiveDate: string): Authority[] { return [...this.publishedAuthorities.values()].filter(item => item.jurisdiction === jurisdiction && item.effectiveFrom <= effectiveDate && this.authorities.get(item.id)?.status !== 'disabled').map(item => structuredClone(item)) }
  getEffectiveEducationModules(jurisdiction: Jurisdiction, effectiveDate: string): EducationModule[] { return [...this.publishedModules.values()].filter(item => item.jurisdiction === jurisdiction && item.effectiveFrom <= effectiveDate && this.modules.get(item.id)?.status !== 'disabled').map(item => structuredClone(item)) }
  /** Exposed so the Cloudflare Pages Functions path can check whether a jurisdiction's ruleset is already published before re-seeding (see apps/web/src/pilot-bootstrap.ts). */
  hasPublishedRuleset(jurisdiction: Jurisdiction): boolean { return [...this.publishedRulesets.values()].some(rules => rules.some(rule => rule.jurisdiction === jurisdiction)) }
  getPublishedRulesetVersionFor(jurisdiction: Jurisdiction): string | undefined { const entry = [...this.publishedRulesets.entries()].find(([, rules]) => rules.some(rule => rule.jurisdiction === jurisdiction)); return entry?.[0] }

  // ------------------------------------------------------------------
  // Matching / analysis / consumer report / export / deletion
  // ------------------------------------------------------------------

  async proposeMatches(sessionId: Id, reportId: Id): Promise<MatchGroup[]> {
    const userId = await this.requireSession(sessionId)
    const report = await this.store.getReport(reportId)
    if (!report || report.userId !== userId) throw new Error('Not found')
    const grouped = new Map<string, Tradeline[]>()
    for (const line of report.tradelines) {
      const creditor = line.creditor.normalized?.toLowerCase() ?? ''
      const account = line.maskedAccount.normalized ?? ''
      const key = `${creditor}:${account}`
      grouped.set(key, [...(grouped.get(key) ?? []), line])
    }
    const result: MatchGroup[] = []
    for (const lines of grouped.values()) {
      if (lines.length < 2) continue
      const uniqueBureaus = new Set(lines.map(line => line.balance.bureau))
      const balanceAgreement = new Set(lines.map(line => line.balance.normalized)).size === 1
      const oversized = lines.length > 3
      const duplicateWithinBureau = uniqueBureaus.size < lines.length
      const confidence = oversized || duplicateWithinBureau ? 0.72 : (balanceAgreement ? 0.95 : 0.72)
      const group: MatchGroup = {
        id: randomUUID(),
        reportId,
        tradelineIds: lines.map(line => line.id),
        confidence,
        signals: ['creditor', 'masked-account', ...(balanceAgreement ? ['balance'] : []), ...(oversized ? ['collision-set'] : []), ...(duplicateWithinBureau ? ['same-bureau-duplicate'] : [])],
        state: oversized || duplicateWithinBureau ? 'split' : confidence >= 0.9 ? 'proposed' : 'split',
        history: [],
      }
      await this.store.saveMatch(group)
      result.push(group)
    }
    return structuredClone(result)
  }
  async decideMatch(sessionId: Id, matchId: Id, action: 'confirmed' | 'rejected' | 'split' | 'merged', reason: string): Promise<MatchGroup> {
    const userId = await this.requireSession(sessionId)
    const match = await this.store.getMatch(matchId)
    const report = match && await this.store.getReport(match.reportId)
    if (!match || !report || report.userId !== userId) throw new Error('Not found')
    if (action === 'confirmed' && match.tradelineIds.length > 3) throw new Error('Oversized collision sets require subgroup confirmation')
    match.state = action; match.history.push({ action, actorId: userId, at: now(), reason })
    await this.store.saveMatch(match)
    await this.audit('match-decision', userId, match.id, { action })
    return structuredClone(match)
  }

  async confirmMatchSubgroup(sessionId: Id, matchId: Id, tradelineIds: Id[], reason: string): Promise<MatchGroup> {
    const userId = await this.requireSession(sessionId)
    const match = await this.store.getMatch(matchId)
    const report = match && await this.store.getReport(match.reportId)
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
    await this.store.saveMatch(subgroup)
    await this.audit('match-subgroup-confirmed', userId, subgroup.id, { parentMatchId: match.id, tradelineCount: String(uniqueTradelineIds.length) })
    return structuredClone(subgroup)
  }

  async runAnalysis(sessionId: Id, reportId: Id, rulesetVersion: string, jurisdiction: Jurisdiction): Promise<Analysis> {
    const userId = await this.requireSession(sessionId)
    const report = await this.store.getReport(reportId); if (!report || report.userId !== userId) throw new Error('Not found')
    if (!report.reviewComplete) throw new Error('Report review is incomplete')
    const matches = await this.store.listMatchesByReport(reportId)
    const unresolvedMatches = matches.filter(match => match.state === 'proposed')
    if (unresolvedMatches.length) throw new Error('Account matching confirmation is incomplete')
    const rules = this.publishedRulesets.get(rulesetVersion); if (!rules) throw new Error('Ruleset not found')
    if (rules.some(rule => rule.status === 'disabled' || rule.authorityIds.some(id => this.authorities.get(id)?.status === 'disabled') || rule.educationModuleIds.some(id => this.modules.get(id)?.status === 'disabled'))) throw new Error('Ruleset contains disabled content')
    const core = evaluateAnalysis({ rules, tradelines: report.tradelines, confirmedMatches: matches.filter(match => match.state === 'confirmed').map(match => ({ tradelineIds: match.tradelineIds })), versions: { normalizedInput: report.normalizedVersion, ruleset: rulesetVersion, jurisdiction, parser: report.parserVersion, application: applicationVersion } })
    const parsedAt = this.timelineBySubject.get(report.id)?.reportParsedAt
    const analysis: Analysis = { ...core, userId, reportId }
    await this.store.saveAnalysis(analysis)
    this.recordTimestamp(analysis.id, { analysisCreatedAt: analysis.createdAt, ...(parsedAt ? { reportParsedAt: parsedAt } : {}) })
    await this.audit('analysis-created', userId, analysis.id, { rulesetVersion })
    return structuredClone(analysis)
  }

  async getAnalysis(sessionId: Id, analysisId: Id): Promise<Analysis> {
    const userId = await this.requireSession(sessionId)
    const analysis = await this.store.getAnalysis(analysisId); if (!analysis || analysis.userId !== userId) throw new Error('Not found')
    return structuredClone(analysis)
  }

  async createConsumerReport(sessionId: Id, analysisId: Id): Promise<ConsumerReport> {
    const userId = await this.requireSession(sessionId)
    const analysis = await this.store.getAnalysis(analysisId); if (!analysis || analysis.userId !== userId) throw new Error('Not found')
    const report = await this.store.getReport(analysis.reportId); if (!report) throw new Error('Not found')
    const activeRules = this.publishedRulesets.get(analysis.versions.ruleset)
    if (!activeRules || activeRules.some(rule => rule.status === 'disabled' || rule.authorityIds.some(id => this.authorities.get(id)?.status === 'disabled') || rule.educationModuleIds.some(id => this.modules.get(id)?.status === 'disabled'))) throw new Error('Report content is disabled')
    const authorityById = new Map([...this.publishedAuthorities.values()].map(item => [item.id, item]))
    const moduleById = new Map([...this.publishedModules.values()].map(item => [item.id, item]))
    const findings: ReportFinding[] = [...analysis.findings]
      .sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] || b.confidence - a.confidence)
      .map(finding => {
        const authorities = finding.authorityIds.map(id => authorityById.get(id)).filter((item): item is Authority => item !== undefined)
        const educationModules = finding.educationModuleIds.map(id => moduleById.get(id)).filter((item): item is EducationModule => item !== undefined)
        if (authorities.length !== finding.authorityIds.length || educationModules.length !== finding.educationModuleIds.length) throw new Error('Published finding content cannot be resolved')
        return { ...finding, authorities, educationModules }
      })
    const ruleset = this.publishedRulesets.get(analysis.versions.ruleset)
    if (!ruleset) throw new Error('Published report rules are unavailable')
    const catalogVersion = this.catalog?.catalogVersion ?? 'legacy-runtime-governance'
    const sectionPrimers = this.catalog ? [...this.publishedModules.values()]
      .filter((module): module is EducationModule & { kind: 'section-primer'; authorityIds: Id[] } => module.kind === 'section-primer' && module.jurisdiction === analysis.versions.jurisdiction && module.effectiveFrom <= report.reportDate && !!module.authorityIds)
      .map(module => {
        const authorities = module.authorityIds.map(id => authorityById.get(id)).filter((item): item is Authority => item !== undefined)
        if (authorities.length !== module.authorityIds.length) throw new Error('Published primer authority cannot be resolved')
        return { ...module, authorities }
      }) : []
    const coverage: CoverageRow[] = ruleset.map(rule => ({ ruleId: rule.id, name: rule.name, requiredInputs: [...rule.requiredInputs], outcomes: analysis.audit.filter(audit => audit.ruleId === rule.id) }))
    const fieldNames = ['accountType', 'balance', 'creditLimit', 'pastDue', 'status', 'opened', 'updated', 'dateOfFirstDelinquency'] as const
    const parserFields: ParserFieldAvailability[] = fieldNames.map(field => ({
      field,
      capability: 'supported',
      states: report.tradelines.reduce<ParserFieldAvailability['states']>((states, line) => {
        const value = line[field]
        states[value.state] += 1
        return states
      }, { known: 0, unknown: 0, blank: 0, 'not-applicable': 0, 'parser-failed': 0 }),
    }))
    for (const field of ['paymentHistory', 'remarks', 'specialCommentCodes'] as const) parserFields.push({
      field,
      capability: 'supported',
      states: report.tradelines.reduce<ParserFieldAvailability['states']>((states, line) => {
        const values = line[field]
        if (values.length === 0) states.unknown += 1
        else for (const value of values) states[value.state] += 1
        return states
      }, { known: 0, unknown: 0, blank: 0, 'not-applicable': 0, 'parser-failed': 0 }),
    })
    const consumerReport: ConsumerReport = {
      id: randomUUID(), userId, analysisId,
      limitations: ['Educational information only', 'No legal verdict; no deletion promise or score prediction'],
      overview: { tradelines: report.tradelines.length, collections: report.collections.length, inquiries: report.inquiries.length, openAccounts: report.tradelines.filter(line => line.status.normalized?.toLowerCase().includes('open')).length },
      findings,
      actions: analysis.findings.map(finding => ({ id: randomUUID(), findingId: finding.id, status: 'unresolved', documents: [] })),
      content: {
        catalogVersion,
        rulesetVersion: analysis.versions.ruleset,
        parserVersion: report.parserVersion,
        sectionPrimers,
        coverage,
        parserFields,
      },
      generatedAt: now(),
    }
    await this.store.saveConsumerReport(consumerReport)
    return structuredClone(consumerReport)
  }
  async getConsumerReport(sessionId: Id, consumerReportId: Id): Promise<ConsumerReport> {
    const userId = await this.requireSession(sessionId)
    const report = await this.store.getConsumerReport(consumerReportId); if (!report || report.userId !== userId) throw new Error('Not found')
    return structuredClone(report)
  }
  async updateAction(sessionId: Id, consumerReportId: Id, actionId: Id, patch: Partial<Pick<ActionItem, 'status' | 'note' | 'reason' | 'documents'>>): Promise<ActionItem> {
    const userId = await this.requireSession(sessionId)
    const report = await this.store.getConsumerReport(consumerReportId); if (!report || report.userId !== userId) throw new Error('Not found')
    const action = report.actions.find(item => item.id === actionId); if (!action) throw new Error('Action not found')
    Object.assign(action, patch)
    await this.store.saveConsumerReport(report)
    await this.audit('action-updated', userId, action.id, { status: action.status })
    return structuredClone(action)
  }

  async createExport(sessionId: Id, consumerReportId: Id): Promise<ExportArtifact> {
    const userId = await this.requireSession(sessionId)
    const report = await this.store.getConsumerReport(consumerReportId); if (!report || report.userId !== userId) throw new Error('Not found')
    const existing = await this.store.findExportByReport(userId, consumerReportId)
    if (existing?.formatVersion === 'consumer-report-v2') return structuredClone(existing)
    const content = JSON.stringify({ formatVersion: 'consumer-report-v2', generatedAt: now(), scope: 'Validated personal credit analysis', report: exportProjection(report) }, null, 2)
    assertSafeConsumerOutput(content)
    const artifact: ExportArtifact = { id: existing?.id ?? randomUUID(), userId, reportId: consumerReportId, formatVersion: 'consumer-report-v2', content, createdAt: existing?.createdAt ?? now() }
    await this.store.saveExport(artifact)
    if (!existing) await this.audit('export-created', userId, artifact.id, {})
    return structuredClone(artifact)
  }
  async getExport(sessionId: Id, exportId: Id): Promise<ExportArtifact> {
    const userId = await this.requireSession(sessionId)
    const artifact = await this.store.getExport(exportId); if (!artifact || artifact.userId !== userId) throw new Error('Not found')
    return structuredClone(artifact)
  }
  async requestDeletion(sessionId: Id, providerDelayed = false): Promise<{ id: Id; status: 'pending-provider' | 'complete'; deleted: string[]; delayed: string[]; receipt: { completedAt: string; outcome: 'account-deleted' } }> {
    const userId = await this.requireSession(sessionId)
    const uploads = await this.store.listUploadsForUser(userId)
    // Remove raw bytes before relational metadata. On a blob failure, leave the account and
    // upload rows intact so the next authenticated request can retry rather than falsely claim completion.
    for (const upload of uploads) await this.blobStore.delete(upload.id)
    const deleted = await this.store.deleteAllUserData(userId)
    const receipt = { id: randomUUID(), completedAt: now(), outcome: 'account-deleted' as const }
    await this.store.deleteAccount(userId)
    await this.store.saveDeletionReceipt(receipt)
    return { id: receipt.id, status: providerDelayed ? 'pending-provider' : 'complete', deleted, delayed: providerDelayed ? ['backup-lifecycle', 'model-provider'] : [], receipt: { completedAt: receipt.completedAt, outcome: receipt.outcome } }
  }

  async narrate(sessionId: Id, analysisId: Id, provider: (payload: string) => string): Promise<{ text: string; mode: 'generated' | 'fallback'; versions: Record<string, string> }> {
    const userId = await this.requireSession(sessionId)
    const analysis = await this.store.getAnalysis(analysisId); if (!analysis || analysis.userId !== userId) throw new Error('Not found')
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

  // ------------------------------------------------------------------
  // Pilot governance / evidence (operator/admin surfaces — in-memory except where they read
  // consumer entities, which routes through the store)
  // ------------------------------------------------------------------

  recordPilotApproval(input: { area: PilotApprovalArea; approver: string; evidenceReference: string }): PilotApproval {
    if (!input.approver.trim() || !input.evidenceReference.trim()) throw new Error('Approval requires an accountable approver and evidence reference')
    const approval = { ...input, approvedAt: now() }
    this.pilotApprovals.set(input.area, approval)
    void this.audit('pilot-approval-recorded', input.approver, input.area, { evidenceReference: input.evidenceReference })
    return structuredClone(approval)
  }
  recordPilotDrill(input: { scenario: string; owner: string; result: PilotDrillResult; gaps: string[]; followUpTicket: string }): PilotDrill {
    if (!input.scenario.trim() || !input.owner.trim() || !input.followUpTicket.trim()) throw new Error('Pilot drill requires scenario, owner, and follow-up ticket')
    const drill: PilotDrill = { id: randomUUID(), ...input, gaps: [...input.gaps], recordedAt: now() }
    this.pilotDrills.push(drill)
    void this.audit('pilot-drill-recorded', input.owner, drill.id, { scenario: input.scenario, result: input.result, followUpTicket: input.followUpTicket })
    return structuredClone(drill)
  }
  getPilotDrills(): PilotDrill[] {
    return this.pilotDrills.map(item => structuredClone(item))
  }
  getPilotDrillEvidenceReport(): PilotDrillEvidenceReport {
    const outcomes: Record<PilotDrillResult, number> = { passed: 0, 'passed-with-gaps': 0, blocked: 0 }
    const openGaps: PilotDrillEvidenceGap[] = []
    const followUpTickets = new Set<string>()
    for (const drill of this.pilotDrills) {
      outcomes[drill.result] += 1
      followUpTickets.add(drill.followUpTicket)
      if (drill.result !== 'passed') openGaps.push({ scenario: drill.scenario, owner: drill.owner, result: drill.result, gaps: [...drill.gaps], followUpTicket: drill.followUpTicket })
    }
    return { generatedAt: now(), totalDrills: this.pilotDrills.length, outcomes, openGaps, followUpTickets: [...followUpTickets] }
  }
  async getPilotEvidenceBundle(input: { comprehension: ComprehensionEvidenceReport; accessibility: AccessibilityEvidenceReport; narration?: NarrationEvaluation }) {
    const pilotGate = this.getPilotGate()
    const quality = await this.getQualityReport()
    const drills = this.getPilotDrillEvidenceReport()
    const failingEvidenceSurfaces: PilotEvidenceSummary['failingEvidenceSurfaces'] = []
    if (!input.comprehension.passed) failingEvidenceSurfaces.push('comprehension')
    if (!input.accessibility.passed) failingEvidenceSurfaces.push('accessibility')
    if (drills.openGaps.length > 0) failingEvidenceSurfaces.push('drills')
    if (input.narration && !input.narration.safe) failingEvidenceSurfaces.push('narration')
    return {
      generatedAt: now(), pilotGate, quality, drills,
      comprehension: structuredClone(input.comprehension), accessibility: structuredClone(input.accessibility),
      ...(input.narration ? { narration: structuredClone(input.narration) } : {}),
      summary: { openApprovalAreas: [...pilotGate.missing], failingEvidenceSurfaces },
    }
  }
  async renderPilotReviewerMarkdown(input: { comprehension: ComprehensionEvidenceReport; accessibility: AccessibilityEvidenceReport; narration?: NarrationEvaluation }): Promise<string> {
    const bundle = await this.getPilotEvidenceBundle(input)
    const lines = [
      '# Pilot reviewer export', '', `Generated at: ${bundle.generatedAt}`, `Pilot gate: ${bundle.pilotGate.ready ? 'ready' : 'not ready'}`,
      `Open approval areas: ${bundle.summary.openApprovalAreas.length > 0 ? bundle.summary.openApprovalAreas.join(', ') : 'none'}`,
      `Failing evidence surfaces: ${bundle.summary.failingEvidenceSurfaces.length > 0 ? bundle.summary.failingEvidenceSurfaces.join(', ') : 'none'}`,
      '', '## Approvals', '',
      ...(bundle.pilotGate.approvals.length > 0 ? bundle.pilotGate.approvals.map(approval => `- ${approval.area}: ${approval.approver} (${approval.evidenceReference})`) : ['- None.']),
      '', '## Evidence surfaces', '',
      `- Comprehension: ${bundle.comprehension.passed ? 'passing' : 'failing'} (${bundle.comprehension.coverage.passedChecks}/${bundle.comprehension.coverage.totalChecks} checks passed${bundle.comprehension.missing.length > 0 ? `; missing: ${bundle.comprehension.missing.join(', ')}` : ''})`,
      `- Accessibility: ${bundle.accessibility.passed ? 'passing' : 'failing'} (${bundle.accessibility.coverage.passedChecks}/${bundle.accessibility.coverage.totalChecks} checks passed${bundle.accessibility.missing.length > 0 ? `; missing: ${bundle.accessibility.missing.join(', ')}` : ''})`,
      `- Drills: ${bundle.drills.openGaps.length === 0 ? 'passing' : 'failing'} (${bundle.drills.totalDrills} recorded; open gaps: ${bundle.drills.openGaps.length})`,
      `- Quality: ${bundle.quality.segments.length} segment${bundle.quality.segments.length === 1 ? '' : 's'} recorded`,
      ...(bundle.narration ? [`- Narration: ${bundle.narration.safe ? 'passing' : 'failing'}${bundle.narration.safe ? '' : ` (violations: ${bundle.narration.violations.join(', ')})`}`] : []),
      '', '## Drill follow-ups', '',
      ...(bundle.drills.openGaps.length > 0 ? bundle.drills.openGaps.map(gap => `- ${gap.scenario} — ${gap.result} — owner: ${gap.owner} — follow-up: ${gap.followUpTicket}`) : ['- None.']),
    ]
    return lines.join('\n')
  }
  async renderPilotReviewerJson(input: { comprehension: ComprehensionEvidenceReport; accessibility: AccessibilityEvidenceReport; narration?: NarrationEvaluation }): Promise<string> {
    const bundle = await this.getPilotEvidenceBundle(input)
    return JSON.stringify({ ...bundle, markdown: await this.renderPilotReviewerMarkdown(input) }, null, 2)
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
  private recordTimestamp(subjectId: Id, patch: Partial<{ uploadCompletedAt?: string; reportParsedAt?: string; analysisCreatedAt?: string }>): void {
    const existing = this.timelineBySubject.get(subjectId) ?? {}
    this.timelineBySubject.set(subjectId, { ...existing, ...patch })
  }

  private getLatencySummary(values: number[]): QualityLatencySummary {
    if (values.length === 0) return { sampleSize: 0, averageMs: 0, maxMs: 0 }
    const total = values.reduce((sum, value) => sum + value, 0)
    return { sampleSize: values.length, averageMs: total / values.length, maxMs: Math.max(...values) }
  }

  async getQualityReport(): Promise<QualityReport> {
    const segments = new Map<string, QualityReportSegment>()
    const [uploads, reports, matches, analyses, users] = await Promise.all([
      this.store.listAllUploads(), this.store.listAllReports(), this.store.listAllMatches(), this.store.listAllAnalyses(), this.store.listAllUsers(),
    ])
    const usersById = new Map(users.map(u => [u.id, u]))
    const reportsByUpload = new Map(reports.map(r => [r.uploadId, r]))

    const getSegment = (provider: string, documentType: 'pdf' | 'html', jurisdiction: Jurisdiction): QualityReportSegment => {
      const key = `${provider}|${documentType}|${jurisdiction}`
      const existing = segments.get(key)
      if (existing) return existing
      const created: QualityReportSegment = {
        provider, documentType, jurisdiction, uploads: 0, parsedReports: 0, analyses: 0,
        findings: { total: 0, averagePerAnalysis: 0, bySeverity: { low: 0, medium: 0, high: 0 }, byClassification: { 'observed-fact': 0, 'inconsistency': 0, 'potential-error': 0, 'verification-recommended': 0, 'potential-compliance-concern': 0, 'insufficient-information': 0, 'educational-opportunity': 0 } },
        matching: { proposedGroups: 0, confirmedGroups: 0, highConfidenceProposals: 0, splitGroups: 0 },
        parser: { reportsWithTradelines: 0, averageTradelinesPerReport: 0 },
        latency: { uploadToParse: { sampleSize: 0, averageMs: 0, maxMs: 0 }, parseToAnalysis: { sampleSize: 0, averageMs: 0, maxMs: 0 } },
      }
      segments.set(key, created)
      return created
    }

    const uploadToParseByKey = new Map<string, number[]>()
    const parseToAnalysisByKey = new Map<string, number[]>()
    const tradelineCountsByKey = new Map<string, number[]>()

    for (const upload of uploads) {
      if (upload.stage !== 'ready-to-parse' || !upload.mediaType) continue
      const jurisdiction = usersById.get(upload.userId)?.consent?.analysisJurisdiction
      if (!jurisdiction) continue
      const provider = reportsByUpload.get(upload.id)?.provider ?? 'unknown'
      const documentType = upload.mediaType === 'application/pdf' ? 'pdf' : 'html'
      const key = `${provider}|${documentType}|${jurisdiction}`
      getSegment(provider, documentType, jurisdiction).uploads += 1
      uploadToParseByKey.set(key, uploadToParseByKey.get(key) ?? [])
      parseToAnalysisByKey.set(key, parseToAnalysisByKey.get(key) ?? [])
      tradelineCountsByKey.set(key, tradelineCountsByKey.get(key) ?? [])
    }

    const uploadsById = new Map(uploads.map(u => [u.id, u]))
    for (const report of reports) {
      const upload = uploadsById.get(report.uploadId)
      if (!upload?.mediaType) continue
      const jurisdiction = usersById.get(report.userId)?.consent?.analysisJurisdiction
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

    const reportsById = new Map(reports.map(r => [r.id, r]))
    for (const match of matches) {
      const report = reportsById.get(match.reportId)
      if (!report) continue
      const upload = uploadsById.get(report.uploadId)
      if (!upload?.mediaType) continue
      const jurisdiction = usersById.get(report.userId)?.consent?.analysisJurisdiction
      if (!jurisdiction) continue
      const documentType = upload.mediaType === 'application/pdf' ? 'pdf' : 'html'
      const segment = getSegment(report.provider, documentType, jurisdiction)
      segment.matching.proposedGroups += 1
      if (match.confidence >= 0.9) segment.matching.highConfidenceProposals += 1
      if (match.state === 'confirmed') segment.matching.confirmedGroups += 1
      if (match.state === 'split' || match.confidence < 0.9) segment.matching.splitGroups += 1
    }

    for (const analysis of analyses) {
      const report = reportsById.get(analysis.reportId)
      if (!report) continue
      const upload = uploadsById.get(report.uploadId)
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

  async getAuditEvents(sessionId: Id): Promise<AuditEvent[]> {
    const userId = await this.requireSession(sessionId)
    return this.store.listAuditEventsForActor(userId)
  }

  /** Session hardening (D10): fails closed on revocation, absolute expiry, and idle timeout;
   *  refreshes lastUsedAt on every authenticated call (sliding idle window). */
  private async requireSession(sessionId: Id): Promise<Id> {
    const session = await this.store.getSession(sessionId)
    if (!session || session.revokedAt) throw new Error('Authentication required')
    const nowMs = Date.now()
    if (Date.parse(session.expiresAt) <= nowMs) throw new Error('Authentication required')
    if (Date.parse(session.lastUsedAt) + SESSION_IDLE_TTL_MS <= nowMs) throw new Error('Authentication required')
    session.lastUsedAt = now()
    await this.store.updateSession(session)
    return session.userId
  }
  private async audit(type: string, actorId: Id, subjectId: Id, metadata: Record<string, string>): Promise<void> {
    await this.store.appendAuditEvent({ id: randomUUID(), type, actorId, subjectId, at: now(), metadata })
  }
}

type ParserInput = { provider: string; template: string; reportDate: string; identity: string[]; addresses: string[]; employers: string[]; inquiries: string[]; publicRecords: string[]; scores: number[]; remarks: string[]; tradelines: Array<{ bureau: Bureau; creditor: string; account: string; accountType: string; balance: number; creditLimit?: number; pastDue?: number; status: string; opened: string; updated: string; dateOfFirstDelinquency?: string; paymentHistory?: Array<{ yearMonth: string; status: string }>; remarks?: string[]; specialCommentCodes?: string[]; confidence?: number }> }
function isParserInput(value: unknown): value is ParserInput { if (!value || typeof value !== 'object') return false; const item = value as Record<string, unknown>; return typeof item.provider === 'string' && typeof item.template === 'string' && typeof item.reportDate === 'string' && ['identity', 'addresses', 'employers', 'inquiries', 'publicRecords', 'scores', 'remarks', 'tradelines'].every(key => Array.isArray(item[key])) }

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
        accountType: toCanonical(t.accountType),
        balance: toCanonical(t.balance, 'USD'),
        creditLimit: toCanonical(t.creditLimit, 'USD'),
        pastDue: toCanonical(t.pastDue, 'USD'),
        status: toCanonical(t.status),
        opened: toCanonical(t.opened),
        updated: toCanonical(t.updated),
        dateOfFirstDelinquency: toCanonical(t.dateOfFirstDelinquency),
        paymentHistory: t.paymentHistory.map(cell => ({ ...toCanonical(cell), yearMonth: cell.yearMonth })),
        remarks: t.remarks.map(value => toCanonical(value)),
        specialCommentCodes: t.specialCommentCodes.map(value => toCanonical(value)),
      })
    })
  return { id: randomUUID(), userId, uploadId, provider: pr.provider, template: pr.template, parserVersion, normalizedVersion: 1, reportDate: pr.reportDate ?? '', identity: [], addresses: [], employers: [], tradelines, collections: [], inquiries: [], publicRecords: [], scores: [], remarks: [], reviewComplete: false }
}
function allValues(report: CanonicalReport): CanonicalValue<unknown>[] { const direct: CanonicalValue<unknown>[] = [...report.identity, ...report.addresses, ...report.employers, ...report.inquiries, ...report.publicRecords, ...report.scores, ...report.remarks]; for (const line of [...report.tradelines, ...report.collections]) direct.push(line.creditor, line.maskedAccount, line.accountType, line.balance, line.creditLimit, line.pastDue, line.status, line.opened, line.updated, line.dateOfFirstDelinquency, ...line.paymentHistory, ...line.remarks, ...line.specialCommentCodes); return direct }
function validateNarration(text: string, analysis: Analysis): boolean { if (!text.trim() || /guarantee|will be deleted|illegal|violation|\b\d{9}\b|ignore previous|system prompt/i.test(text)) return false; return analysis.findings.every(finding => text.includes(finding.title) && finding.limitations.every(limitation => text.includes(limitation))) }
