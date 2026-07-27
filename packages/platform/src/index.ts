import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto'
import { applicationVersion } from '../../domain/src/index.js'
import { evaluateAnalysis, SEVERITY_RANK } from '../../analysis-core/src/index.js'
import type { Analysis as CoreAnalysis, Finding, FindingClassification, RuleAudit, SourceReference } from '../../analysis-core/src/index.js'

export type { Finding, FindingClassification, RuleAudit, SourceReference }
export type Id = string
export type Jurisdiction = 'US-CA'
export type Bureau = 'equifax' | 'experian' | 'transunion'
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
export type PilotGate = { ready: boolean; missing: PilotApprovalArea[]; approvals: PilotApproval[] }

const now = () => new Date().toISOString()
const hashPassword = (password: string, salt: string) => scryptSync(password, salt, 32).toString('hex')
const maskAccount = (value: string) => `••••${value.replace(/\D/g, '').slice(-4)}`

export class CreditAnalysisPlatform {
  private users = new Map<Id, User>()
  private usersByEmail = new Map<string, Id>()
  private sessions = new Map<Id, Session>()
  private workspaces = new Map<Id, Workspace>()
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
  private reviewers = new Map<Id, Reviewer>()
  private pilotApprovals = new Map<PilotApprovalArea, PilotApproval>()
  readonly auditEvents: AuditEvent[] = []

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
    if (input.residence !== 'US-CA' || input.analysisJurisdiction !== 'US-CA') throw new Error('Jurisdiction is not enabled for the pilot')
    const user = this.users.get(userId); if (!user) throw new Error('User not found')
    user.consent = { ...input, acceptedAt: now() }
    const workspace = { id: randomUUID(), userId, createdAt: now() }; this.workspaces.set(workspace.id, workspace)
    this.audit('consent-recorded', userId, workspace.id, { version: input.version, jurisdiction: input.analysisJurisdiction })
    return workspace
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
    upload.stage = 'scanning'
    const content = Buffer.from(input.bytes); const lowerName = input.fileName.toLowerCase(); const isPdf = input.mediaType === 'application/pdf' && lowerName.endsWith('.pdf') && content.subarray(0, 5).toString() === '%PDF-'
    const isHtml = input.mediaType === 'text/html' && lowerName.endsWith('.html') && /^\s*<(?:!doctype html|html)/i.test(content.toString('utf8'))
    if (!isPdf && !isHtml) return this.failUpload(upload, 'final-failure', 'Unsupported or mismatched report format')
    if (content.byteLength > 5_000_000) return this.failUpload(upload, 'final-failure', 'Report exceeds processing limits')
    const raw = content.toString('utf8')
    if (/EICAR|<script|javascript:|<iframe|https?:\/\//i.test(raw)) return this.failUpload(upload, 'quarantined', 'The report could not be processed safely', 'unsafe')
    if (/\/Encrypt\b/i.test(raw)) return this.failUpload(upload, 'final-failure', 'Password-protected PDFs are not supported')
    const sourceHash = createHash('sha256').update(content).digest('hex'); const existing = this.uploadByHash.get(`${upload.userId}:${sourceHash}`)
    if (existing && existing !== upload.id) return structuredClone(this.uploads.get(existing) ?? upload)
    upload.fileName = input.fileName; upload.mediaType = isPdf ? 'application/pdf' : 'text/html'; upload.size = content.byteLength; upload.sourceHash = sourceHash; upload.scanResult = 'clean'; upload.retentionClass = 'consumer-report'; upload.stage = 'ready-to-parse'; upload.sanitizedContent = raw.replace(/<script[\s\S]*?<\/script>/gi, ''); upload.completedAt = now(); this.uploadByHash.set(`${upload.userId}:${sourceHash}`, upload.id)
    this.audit('upload-completed', upload.userId, upload.id, { mediaType: upload.mediaType, sourceHash }); return structuredClone(upload)
  }

  private failUpload(upload: Upload, stage: UploadStage, message: string, scanResult?: 'unsafe'): Upload { upload.stage = stage; upload.failureMessage = message; if (scanResult) upload.scanResult = scanResult; this.audit(stage === 'quarantined' ? 'upload-quarantined' : 'upload-failed', upload.userId, upload.id); return structuredClone(upload) }

  parseReport(sessionId: Id, uploadId: Id): CanonicalReport {
    const userId = this.requireSession(sessionId); const upload = this.uploads.get(uploadId); if (!upload || upload.userId !== userId) throw new Error('Not found'); if (upload.stage !== 'ready-to-parse' || !upload.sanitizedContent) throw new Error('Upload is not parseable')
    const marker = 'GOLDEN-AUDIT-REPORT:'; const markerIndex = upload.sanitizedContent.indexOf(marker); if (markerIndex < 0) throw new Error('Unsupported report provider or template')
    const json = upload.sanitizedContent.slice(markerIndex + marker.length).replace(/<\/body>[\s\S]*/i, '').replace(/%%EOF[\s\S]*/i, '').trim(); const input: unknown = JSON.parse(json)
    if (!isParserInput(input)) throw new Error('Report schema validation failed')
    const parserVersion = 'fixture-adapter@1'; const extractionMethod = upload.mediaType === 'application/pdf' ? 'native-text' : 'html-selector'
    const makeValue = <T>(bureau: Bureau, field: string, normalized: T | null, originalDisplay: string, locator: string, confidence = 1): CanonicalValue<T> => ({ id: randomUUID(), bureau, field, normalized, originalDisplay, state: normalized === null ? 'unknown' : 'known', source: { kind: upload.mediaType === 'application/pdf' ? 'page' : 'element', locator, snippet: originalDisplay.slice(0, 80) }, extractionMethod, parserVersion, confidence })
    const tradelines = input.tradelines.map((line, index): Tradeline => ({ id: randomUUID(), creditor: makeValue(line.bureau, 'creditor', line.creditor, line.creditor, `${index}:creditor`), maskedAccount: makeValue(line.bureau, 'account', maskAccount(line.account), maskAccount(line.account), `${index}:account`), accountType: makeValue(line.bureau, 'accountType', line.accountType, line.accountType, `${index}:type`), balance: { ...makeValue(line.bureau, 'balance', line.balance, `$${(line.balance / 100).toFixed(2)}`, `${index}:balance`, line.confidence ?? 1), currency: 'USD' }, status: makeValue(line.bureau, 'status', line.status, line.status, `${index}:status`), opened: { ...makeValue(line.bureau, 'opened', line.opened, line.opened, `${index}:opened`), datePrecision: line.opened.length === 7 ? 'month' : 'day' }, updated: { ...makeValue(line.bureau, 'updated', line.updated, line.updated, `${index}:updated`), datePrecision: line.updated.length === 7 ? 'month' : 'day' } }))
    const firstBureau = input.tradelines[0]?.bureau ?? 'equifax'; const mapText = (items: string[], field: string) => items.map((value, i) => makeValue(firstBureau, field, value, value, `${field}:${i}`))
    const report: CanonicalReport = { id: randomUUID(), userId, uploadId, provider: input.provider, template: input.template, parserVersion, normalizedVersion: 1, reportDate: input.reportDate, identity: mapText(input.identity, 'identity'), addresses: mapText(input.addresses, 'address'), employers: mapText(input.employers, 'employer'), tradelines, collections: [], inquiries: mapText(input.inquiries, 'inquiry'), publicRecords: mapText(input.publicRecords, 'publicRecord'), scores: input.scores.map((score, i) => makeValue(firstBureau, 'score', score, String(score), `score:${i}`)), remarks: mapText(input.remarks, 'remark'), reviewComplete: false }
    this.reports.set(report.id, report); this.audit('report-parsed', userId, report.id, { parserVersion }); return structuredClone(report)
  }

  reviewValue(sessionId: Id, reportId: Id, valueId: Id, input: { decision: ReviewDecision; reason: string; replacement?: string | number }): CanonicalReport {
    const userId = this.requireSession(sessionId); const report = this.reports.get(reportId); if (!report || report.userId !== userId) throw new Error('Not found'); const value = allValues(report).find(item => item.id === valueId); if (!value) throw new Error('Value not found')
    value.review = { decision: input.decision, reason: input.reason, actorId: userId, at: now(), ...(input.replacement !== undefined ? { replacement: input.replacement } : {}) }; report.normalizedVersion += 1; this.audit('report-value-reviewed', userId, valueId, { decision: input.decision }); return structuredClone(report)
  }
  completeReview(sessionId: Id, reportId: Id): void { const userId = this.requireSession(sessionId); const report = this.reports.get(reportId); if (!report || report.userId !== userId) throw new Error('Not found'); report.reviewComplete = true }
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

  proposeMatches(sessionId: Id, reportId: Id): MatchGroup[] { const userId = this.requireSession(sessionId); const report = this.reports.get(reportId); if (!report || report.userId !== userId) throw new Error('Not found'); const grouped = new Map<string, Tradeline[]>(); for (const line of report.tradelines) { const key = `${line.creditor.normalized?.toLowerCase()}:${line.maskedAccount.normalized}`; grouped.set(key, [...(grouped.get(key) ?? []), line]) } const result: MatchGroup[] = []; for (const lines of grouped.values()) { if (lines.length < 2) continue; const balanceAgreement = new Set(lines.map(line => line.balance.normalized)).size === 1; const confidence = balanceAgreement ? 0.95 : 0.72; const group: MatchGroup = { id: randomUUID(), reportId, tradelineIds: lines.map(line => line.id), confidence, signals: ['creditor', 'masked-account', ...(balanceAgreement ? ['balance'] : [])], state: confidence >= 0.9 ? 'proposed' : 'split', history: [] }; this.matches.set(group.id, group); result.push(group) } return structuredClone(result) }
  decideMatch(sessionId: Id, matchId: Id, action: 'confirmed' | 'rejected' | 'split' | 'merged', reason: string): MatchGroup { const userId = this.requireSession(sessionId); const match = this.matches.get(matchId); const report = match && this.reports.get(match.reportId); if (!match || !report || report.userId !== userId) throw new Error('Not found'); match.state = action; match.history.push({ action, actorId: userId, at: now(), reason }); this.audit('match-decision', userId, match.id, { action }); return structuredClone(match) }

  runAnalysis(sessionId: Id, reportId: Id, rulesetVersion: string, jurisdiction: Jurisdiction): Analysis { const userId = this.requireSession(sessionId); const report = this.reports.get(reportId); if (!report || report.userId !== userId) throw new Error('Not found'); if (!report.reviewComplete) throw new Error('Report review is incomplete'); const unresolvedMatches = [...this.matches.values()].filter(match => match.reportId === reportId && match.state === 'proposed'); if (unresolvedMatches.length) throw new Error('Account matching confirmation is incomplete'); const rules = this.publishedRulesets.get(rulesetVersion); if (!rules) throw new Error('Ruleset not found')
    const core = evaluateAnalysis({ rules, tradelines: report.tradelines, confirmedMatches: [...this.matches.values()].filter(match => match.reportId === reportId && match.state === 'confirmed').map(match => ({ tradelineIds: match.tradelineIds })), versions: { normalizedInput: report.normalizedVersion, ruleset: rulesetVersion, jurisdiction, parser: report.parserVersion, application: applicationVersion } })
    const analysis: Analysis = { ...core, userId, reportId }; this.analyses.set(analysis.id, analysis); this.audit('analysis-created', userId, analysis.id, { rulesetVersion }); return structuredClone(analysis) }

  createConsumerReport(sessionId: Id, analysisId: Id): ConsumerReport { const userId = this.requireSession(sessionId); const analysis = this.analyses.get(analysisId); if (!analysis || analysis.userId !== userId) throw new Error('Not found'); const report = this.reports.get(analysis.reportId); if (!report) throw new Error('Not found'); const consumerReport: ConsumerReport = { id: randomUUID(), userId, analysisId, limitations: ['Educational information only', 'No legal verdict, deletion promise, or score guarantee'], overview: { tradelines: report.tradelines.length, collections: report.collections.length, inquiries: report.inquiries.length, openAccounts: report.tradelines.filter(line => line.status.normalized?.toLowerCase().includes('open')).length }, findings: [...analysis.findings].sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] || b.confidence - a.confidence), actions: analysis.findings.map(finding => ({ id: randomUUID(), findingId: finding.id, status: 'unresolved', documents: [] })), generatedAt: now() }; this.consumerReports.set(consumerReport.id, consumerReport); return structuredClone(consumerReport) }
  updateAction(sessionId: Id, consumerReportId: Id, actionId: Id, patch: Partial<Pick<ActionItem, 'status' | 'note' | 'reason' | 'documents'>>): ActionItem { const userId = this.requireSession(sessionId); const report = this.consumerReports.get(consumerReportId); if (!report || report.userId !== userId) throw new Error('Not found'); const action = report.actions.find(item => item.id === actionId); if (!action) throw new Error('Action not found'); Object.assign(action, patch); this.audit('action-updated', userId, action.id, { status: action.status }); return structuredClone(action) }

  createExport(sessionId: Id, consumerReportId: Id): ExportArtifact { const userId = this.requireSession(sessionId); const report = this.consumerReports.get(consumerReportId); if (!report || report.userId !== userId) throw new Error('Not found'); const existing = [...this.exports.values()].find(item => item.userId === userId && item.reportId === consumerReportId); if (existing) return structuredClone(existing); const analysis = this.analyses.get(report.analysisId); const content = JSON.stringify({ generatedAt: now(), scope: 'Validated personal credit analysis', rulesetVersion: analysis?.versions.ruleset, limitations: report.limitations, disclaimer: 'Educational information only; no guaranteed outcome.', findings: report.findings.map(finding => ({ ...finding, evidence: finding.evidence.map(evidence => ({ ...evidence, value: typeof evidence.value === 'string' && /\d{5,}/.test(evidence.value) ? maskAccount(evidence.value) : evidence.value })) })) }, null, 2); const artifact = { id: randomUUID(), userId, reportId: consumerReportId, content, createdAt: now() }; this.exports.set(artifact.id, artifact); this.audit('export-created', userId, artifact.id); return structuredClone(artifact) }
  requestDeletion(sessionId: Id, providerDelayed = false): DeletionJob { const userId = this.requireSession(sessionId); const deleted: string[] = []; for (const [name, map] of [['uploads', this.uploads], ['reports', this.reports], ['analyses', this.analyses], ['consumer-reports', this.consumerReports], ['exports', this.exports]] as const) for (const [id, item] of map) if ('userId' in item && item.userId === userId) { map.delete(id); deleted.push(`${name}:${id}`) } const job: DeletionJob = { id: randomUUID(), userId, status: providerDelayed ? 'pending-provider' : 'complete', deleted, delayed: providerDelayed ? ['backup-lifecycle', 'model-provider'] : [], ...(providerDelayed ? {} : { completedAt: now() }) }; this.deletionJobs.set(job.id, job); this.audit('deletion-requested', userId, job.id, { status: job.status }); return structuredClone(job) }

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
          return { text, mode: 'generated', versions: { model: 'configured-provider', prompt: 'narration@1', retrieval: 'approved-content@1', application: applicationVersion } }
        }
      } catch {
        // Retry once with the same constrained structured payload, then fall back.
      }
    }
    return fallback()
  }

  recordPilotApproval(input: { area: PilotApprovalArea; approver: string; evidenceReference: string }): PilotApproval {
    if (!input.approver.trim() || !input.evidenceReference.trim()) throw new Error('Approval requires an accountable approver and evidence reference')
    const approval = { ...input, approvedAt: now() }
    this.pilotApprovals.set(input.area, approval)
    this.audit('pilot-approval-recorded', input.approver, input.area, { evidenceReference: input.evidenceReference })
    return structuredClone(approval)
  }
  getPilotGate(): PilotGate {
    const required: PilotApprovalArea[] = ['product', 'legal', 'privacy', 'security', 'operations', 'accessibility', 'vendor']
    const missing = required.filter(area => !this.pilotApprovals.has(area))
    return { ready: missing.length === 0, missing, approvals: [...this.pilotApprovals.values()].map(item => structuredClone(item)) }
  }
  assertRealConsumerPilotReady(): void { const gate = this.getPilotGate(); if (!gate.ready) throw new Error(`Pilot approvals incomplete: ${gate.missing.join(', ')}`) }
  getAuditEvents(sessionId: Id): AuditEvent[] { const userId = this.requireSession(sessionId); return this.auditEvents.filter(event => event.actorId === userId).map(event => structuredClone(event)) }
  private requireSession(sessionId: Id): Id { const session = this.sessions.get(sessionId); if (!session || session.revokedAt) throw new Error('Authentication required'); return session.userId }
  private audit(type: string, actorId: Id, subjectId: Id, metadata: Record<string, string> = {}): void { this.auditEvents.push({ type, actorId, subjectId, at: now(), metadata }) }
}

type ParserInput = { provider: string; template: string; reportDate: string; identity: string[]; addresses: string[]; employers: string[]; inquiries: string[]; publicRecords: string[]; scores: number[]; remarks: string[]; tradelines: Array<{ bureau: Bureau; creditor: string; account: string; accountType: string; balance: number; status: string; opened: string; updated: string; confidence?: number }> }
function isParserInput(value: unknown): value is ParserInput { if (!value || typeof value !== 'object') return false; const item = value as Record<string, unknown>; return typeof item.provider === 'string' && typeof item.template === 'string' && typeof item.reportDate === 'string' && ['identity', 'addresses', 'employers', 'inquiries', 'publicRecords', 'scores', 'remarks', 'tradelines'].every(key => Array.isArray(item[key])) }
function allValues(report: CanonicalReport): CanonicalValue<unknown>[] { const direct: CanonicalValue<unknown>[] = [...report.identity, ...report.addresses, ...report.employers, ...report.inquiries, ...report.publicRecords, ...report.scores, ...report.remarks]; for (const line of [...report.tradelines, ...report.collections]) direct.push(line.creditor, line.maskedAccount, line.accountType, line.balance, line.status, line.opened, line.updated); return direct }
// severityRank removed — the engine's SEVERITY_RANK (imported) is used directly.
function validateNarration(text: string, analysis: Analysis): boolean { if (!text.trim() || /guarantee|will be deleted|illegal|violation|\b\d{9}\b|ignore previous|system prompt/i.test(text)) return false; return analysis.findings.every(finding => text.includes(finding.title) && finding.limitations.every(limitation => text.includes(limitation))) }
