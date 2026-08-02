import { randomUUID } from 'node:crypto'
import type {
  Id, User, Session, Workspace, AuthorizationRecord, Upload, CanonicalReport,
  MatchGroup, Analysis, ConsumerReport, ExportArtifact, DeletionJob, AuditEvent, Consent, ReportPresentationProfile,
  ConsumerIdentity,
} from './entities.js'

/**
 * Repository seam (docs/consumer-workflow-implementation-plan.md D5).
 *
 * Covers exactly the PII-bearing, per-consumer entities implicated in the failure modes
 * D5 fixes: last-write-wins on concurrent users, the D1 single-row size limit, and an
 * unkeepable deletion promise. Governance/rules/authorities/education-modules/reviewers/
 * pilotApprovals/pilotDrills/launchScope are deliberately NOT in this interface — they are
 * operator-seeded config, identical for every user, re-bootstrapped fresh per instantiation
 * (see bootstrapGovernance in apps/web/src/pilot-bootstrap.ts), and are not implicated in
 * any of the four failure modes. They stay in-memory and synchronous on the platform class.
 *
 * Async throughout because D1 (Cloudflare) is async-only; the in-memory and SQLite
 * implementations are internally synchronous but expose the same Promise-returning surface
 * so CreditAnalysisPlatform has exactly one code path regardless of backend.
 *
 * Raw upload bytes are deliberately absent from this interface — they never touch this
 * store (D1 or SQLite). See BlobStore below.
 */
export interface PlatformStore {
  getUserById(id: Id): Promise<User | undefined>
  getUserByEmail(email: string): Promise<User | undefined>
  createUser(user: User): Promise<void>
  updateUserConsent(userId: Id, consent: Consent): Promise<void>
  updateUserPassword(userId: Id, passwordHash: string, passwordSalt: string): Promise<void>
  markEmailVerified(userId: Id, at: string): Promise<void>

  getSession(id: Id): Promise<Session | undefined>
  createSession(session: Session): Promise<void>
  updateSession(session: Session): Promise<void>
  listActiveSessionsForUser(userId: Id): Promise<Session[]>

  getReportPresentationProfile(): Promise<ReportPresentationProfile | undefined>
  saveReportPresentationProfile(profile: ReportPresentationProfile): Promise<void>

  getWorkspace(id: Id): Promise<Workspace | undefined>
  listWorkspacesForUser(userId: Id): Promise<Workspace[]>
  createWorkspace(workspace: Workspace): Promise<void>

  getAuthorizationByUser(userId: Id): Promise<AuthorizationRecord | undefined>
  createAuthorization(record: AuthorizationRecord): Promise<void>

  /** Attested identity is 1:1 with its user but lives in its own row rather than users.payload_json:
   *  it carries an SSN fragment and a date of birth, and a dedicated row makes its deletion an
   *  explicitly auditable step rather than a side effect of deleting the account record. */
  getConsumerIdentity(userId: Id): Promise<ConsumerIdentity | undefined>
  saveConsumerIdentity(identity: ConsumerIdentity): Promise<void>

  getUpload(id: Id): Promise<Upload | undefined>
  listUploadsForUser(userId: Id): Promise<Upload[]>
  getUploadIdByHash(key: string): Promise<Id | undefined>
  saveUpload(upload: Upload, hashKey?: string): Promise<void>

  getReport(id: Id): Promise<CanonicalReport | undefined>
  listReportsForUser(userId: Id): Promise<CanonicalReport[]>
  saveReport(report: CanonicalReport): Promise<void>

  getMatch(id: Id): Promise<MatchGroup | undefined>
  saveMatch(match: MatchGroup): Promise<void>
  listMatchesByReport(reportId: Id): Promise<MatchGroup[]>

  getAnalysis(id: Id): Promise<Analysis | undefined>
  listAnalysesForUser(userId: Id): Promise<Analysis[]>
  saveAnalysis(analysis: Analysis): Promise<void>

  getConsumerReport(id: Id): Promise<ConsumerReport | undefined>
  listConsumerReportsForUser(userId: Id): Promise<ConsumerReport[]>
  saveConsumerReport(report: ConsumerReport): Promise<void>

  getExport(id: Id): Promise<ExportArtifact | undefined>
  saveExport(artifact: ExportArtifact): Promise<void>
  findExportByReport(userId: Id, reportId: Id): Promise<ExportArtifact | undefined>

  saveDeletionJob(job: DeletionJob): Promise<void>
  saveDeletionReceipt(receipt: { id: Id; completedAt: string; outcome: 'account-deleted' }): Promise<void>
  /** Deletes every row owned by userId across uploads/reports/matches/analyses/consumerReports/exports. Returns "table:id" labels for the deleted rows (mirrors the pre-existing DeletionJob.deleted shape). */
  deleteAllUserData(userId: Id): Promise<string[]>
  deleteAccount(userId: Id): Promise<void>

  appendAuditEvent(event: AuditEvent & { id: Id }): Promise<void>
  listAuditEventsForActor(actorId: Id): Promise<AuditEvent[]>

  // Bulk scans — used only by quality reporting / admin evidence exports, never by the
  // consumer request path. D1 and SQLite both do these cheaply as plain table scans.
  listAllUsers(): Promise<User[]>
  listAllUploads(): Promise<Upload[]>
  listAllReports(): Promise<CanonicalReport[]>
  listAllMatches(): Promise<MatchGroup[]>
  listAllAnalyses(): Promise<Analysis[]>

  // Invites (D10) — kept on the same store rather than a separate interface since it's the
  // same tenant-durability concern (must survive the request boundary, must not double-issue).
  getInvite(code: string): Promise<{ code: string; createdAt: string; usedAt?: string; usedByUserId?: Id } | undefined>
  createInvite(code: string, createdAt: string): Promise<void>
  consumeInvite(code: string, usedByUserId: Id, usedAt: string): Promise<boolean>

  // Password reset / email verification tokens (D10).
  createToken(kind: 'password-reset' | 'email-verify', token: string, userId: Id, expiresAt: string): Promise<void>
  consumeToken(kind: 'password-reset' | 'email-verify', token: string): Promise<{ userId: Id } | undefined>
}

/**
 * Raw upload bytes never touch PlatformStore (D5: "raw bytes live in R2 only, never D1").
 * R2Blob for Cloudflare, filesystem for local Node dev — see the two implementations in
 * apps/web/functions/api/_platform.ts and apps/web/src/runtime-store.ts.
 */
export interface BlobStore {
  get(id: Id): Promise<Uint8Array | undefined>
  put(id: Id, bytes: Uint8Array): Promise<void>
  delete(id: Id): Promise<void>
}

/** Default backend: in-memory Maps, identical behavior to the pre-D5 implementation. Used
 *  by every test that doesn't care about cross-request durability (the overwhelming majority),
 *  and as the safe default when no store is injected. */
export class InMemoryStore implements PlatformStore {
  private users = new Map<Id, User>()
  private usersByEmail = new Map<string, Id>()
  private sessions = new Map<Id, Session>()
  private reportPresentationProfile: ReportPresentationProfile | undefined
  private workspaces = new Map<Id, Workspace>()
  private authorizations = new Map<Id, AuthorizationRecord>()
  private authorizationByUser = new Map<Id, Id>()
  private consumerIdentities = new Map<Id, ConsumerIdentity>()
  private uploads = new Map<Id, Upload>()
  private uploadByHash = new Map<string, Id>()
  private reports = new Map<Id, CanonicalReport>()
  private matches = new Map<Id, MatchGroup>()
  private analyses = new Map<Id, Analysis>()
  private consumerReports = new Map<Id, ConsumerReport>()
  private exports = new Map<Id, ExportArtifact>()
  private deletionJobs = new Map<Id, DeletionJob>()
  private deletionReceipts = new Map<Id, { id: Id; completedAt: string; outcome: 'account-deleted' }>()
  private auditEvents: Array<AuditEvent & { id: Id }> = []
  private invites = new Map<string, { code: string; createdAt: string; usedAt?: string; usedByUserId?: Id }>()
  private tokens = new Map<string, { kind: string; userId: Id; expiresAt: string }>()

  async getUserById(id: Id) { return this.users.get(id) ? structuredClone(this.users.get(id)) : undefined }
  async getUserByEmail(email: string) { const id = this.usersByEmail.get(email); return id ? structuredClone(this.users.get(id)) : undefined }
  async createUser(user: User) { this.users.set(user.id, structuredClone(user)); this.usersByEmail.set(user.email, user.id) }
  async updateUserConsent(userId: Id, consent: Consent) { const user = this.users.get(userId); if (user) user.consent = consent }
  async updateUserPassword(userId: Id, passwordHash: string, passwordSalt: string) { const user = this.users.get(userId); if (user) { user.passwordHash = passwordHash; user.passwordSalt = passwordSalt } }
  async markEmailVerified(userId: Id, at: string) { const user = this.users.get(userId); if (user) user.emailVerifiedAt = at }

  async getSession(id: Id) { const s = this.sessions.get(id); return s ? structuredClone(s) : undefined }
  async createSession(session: Session) { this.sessions.set(session.id, structuredClone(session)) }
  async updateSession(session: Session) { this.sessions.set(session.id, structuredClone(session)) }
  async listActiveSessionsForUser(userId: Id) { return [...this.sessions.values()].filter(s => s.userId === userId && !s.revokedAt).map(s => structuredClone(s)) }

  async getReportPresentationProfile() { return this.reportPresentationProfile ? structuredClone(this.reportPresentationProfile) : undefined }
  async saveReportPresentationProfile(profile: ReportPresentationProfile) { this.reportPresentationProfile = structuredClone(profile) }

  async getWorkspace(id: Id) { const w = this.workspaces.get(id); return w ? structuredClone(w) : undefined }
  async listWorkspacesForUser(userId: Id) { return [...this.workspaces.values()].filter(item => item.userId === userId).map(item => structuredClone(item)) }
  async createWorkspace(workspace: Workspace) { this.workspaces.set(workspace.id, structuredClone(workspace)) }

  async getAuthorizationByUser(userId: Id) { const id = this.authorizationByUser.get(userId); return id ? structuredClone(this.authorizations.get(id)) : undefined }
  async createAuthorization(record: AuthorizationRecord) { this.authorizations.set(record.id, structuredClone(record)); this.authorizationByUser.set(record.userId, record.id) }

  async getConsumerIdentity(userId: Id) { const item = this.consumerIdentities.get(userId); return item ? structuredClone(item) : undefined }
  async saveConsumerIdentity(identity: ConsumerIdentity) { this.consumerIdentities.set(identity.userId, structuredClone(identity)) }

  async getUpload(id: Id) { const u = this.uploads.get(id); return u ? structuredClone(u) : undefined }
  async listUploadsForUser(userId: Id) { return [...this.uploads.values()].filter(item => item.userId === userId).map(item => structuredClone(item)) }
  async getUploadIdByHash(key: string) { return this.uploadByHash.get(key) }
  async saveUpload(upload: Upload, hashKey?: string) { this.uploads.set(upload.id, structuredClone(upload)); if (hashKey) this.uploadByHash.set(hashKey, upload.id) }

  async getReport(id: Id) { const r = this.reports.get(id); return r ? structuredClone(r) : undefined }
  async listReportsForUser(userId: Id) { return [...this.reports.values()].filter(item => item.userId === userId).map(item => structuredClone(item)) }
  async saveReport(report: CanonicalReport) { this.reports.set(report.id, structuredClone(report)) }

  async getMatch(id: Id) { const m = this.matches.get(id); return m ? structuredClone(m) : undefined }
  async saveMatch(match: MatchGroup) { this.matches.set(match.id, structuredClone(match)) }
  async listMatchesByReport(reportId: Id) { return [...this.matches.values()].filter(m => m.reportId === reportId).map(m => structuredClone(m)) }

  async getAnalysis(id: Id) { const a = this.analyses.get(id); return a ? structuredClone(a) : undefined }
  async listAnalysesForUser(userId: Id) { return [...this.analyses.values()].filter(item => item.userId === userId).map(item => structuredClone(item)) }
  async saveAnalysis(analysis: Analysis) { this.analyses.set(analysis.id, structuredClone(analysis)) }

  async getConsumerReport(id: Id) { const c = this.consumerReports.get(id); return c ? structuredClone(c) : undefined }
  async listConsumerReportsForUser(userId: Id) { return [...this.consumerReports.values()].filter(item => item.userId === userId).map(item => structuredClone(item)) }
  async saveConsumerReport(report: ConsumerReport) { this.consumerReports.set(report.id, structuredClone(report)) }

  async getExport(id: Id) { const e = this.exports.get(id); return e ? structuredClone(e) : undefined }
  async saveExport(artifact: ExportArtifact) { this.exports.set(artifact.id, structuredClone(artifact)) }
  async findExportByReport(userId: Id, reportId: Id) { return structuredClone([...this.exports.values()].find(e => e.userId === userId && e.reportId === reportId)) }

  async saveDeletionJob(job: DeletionJob) { this.deletionJobs.set(job.id, structuredClone(job)) }
  async saveDeletionReceipt(receipt: { id: Id; completedAt: string; outcome: 'account-deleted' }) { this.deletionReceipts.set(receipt.id, structuredClone(receipt)) }
  async deleteAllUserData(userId: Id): Promise<string[]> {
    const deleted: string[] = []
    for (const [name, map] of [['uploads', this.uploads], ['reports', this.reports], ['matches', this.matches], ['analyses', this.analyses], ['consumer-reports', this.consumerReports], ['exports', this.exports]] as const) {
      for (const [id, item] of map) if ('userId' in item ? item.userId === userId : this.reports.get((item as MatchGroup).reportId)?.userId === userId) { map.delete(id); deleted.push(`${name}:${id}`) }
    }
    for (const [key, id] of [...this.uploadByHash.entries()]) if (!this.uploads.has(id)) this.uploadByHash.delete(key)
    return deleted
  }
  async deleteAccount(userId: Id) {
    this.users.delete(userId)
    for (const [email, id] of this.usersByEmail) if (id === userId) this.usersByEmail.delete(email)
    for (const [id, item] of this.sessions) if (item.userId === userId) this.sessions.delete(id)
    for (const [id, item] of this.workspaces) if (item.userId === userId) this.workspaces.delete(id)
    for (const [id, item] of this.authorizations) if (item.userId === userId) { this.authorizations.delete(id); this.authorizationByUser.delete(userId) }
    this.consumerIdentities.delete(userId)
    for (const [key, item] of this.tokens) if (item.userId === userId) this.tokens.delete(key)
    this.auditEvents = this.auditEvents.filter(event => event.actorId !== userId && event.subjectId !== userId)
  }
  async appendAuditEvent(event: AuditEvent & { id: Id }) { this.auditEvents.push(structuredClone(event)) }
  async listAuditEventsForActor(actorId: Id) { return this.auditEvents.filter(e => e.actorId === actorId).map(e => structuredClone(e)) }

  async listAllUsers() { return [...this.users.values()].map(u => structuredClone(u)) }
  async listAllUploads() { return [...this.uploads.values()].map(u => structuredClone(u)) }
  async listAllReports() { return [...this.reports.values()].map(r => structuredClone(r)) }
  async listAllMatches() { return [...this.matches.values()].map(m => structuredClone(m)) }
  async listAllAnalyses() { return [...this.analyses.values()].map(a => structuredClone(a)) }

  async getInvite(code: string) { const i = this.invites.get(code); return i ? structuredClone(i) : undefined }
  async createInvite(code: string, createdAt: string) { this.invites.set(code, { code, createdAt }) }
  async consumeInvite(code: string, usedByUserId: Id, usedAt: string) {
    const invite = this.invites.get(code)
    if (!invite || invite.usedAt) return false
    invite.usedAt = usedAt; invite.usedByUserId = usedByUserId
    return true
  }

  async createToken(kind: 'password-reset' | 'email-verify', token: string, userId: Id, expiresAt: string) { this.tokens.set(`${kind}:${token}`, { kind, userId, expiresAt }) }
  async consumeToken(kind: 'password-reset' | 'email-verify', token: string) {
    const key = `${kind}:${token}`
    const entry = this.tokens.get(key)
    if (!entry) return undefined
    this.tokens.delete(key)
    if (Date.parse(entry.expiresAt) <= Date.now()) return undefined
    return { userId: entry.userId }
  }
}

export function randomInviteCode(): string {
  return randomUUID().replace(/-/g, '').slice(0, 12)
}

/** Default BlobStore: in-memory, matches the pre-D5 rawUploadBytes Map. Used by tests and as
 *  the safe default when no store is injected — never used by the Cloudflare or Node dev paths,
 *  which inject R2Store / FileBlobStore respectively so bytes actually survive a restart. */
export class InMemoryBlobStore implements BlobStore {
  private bytes = new Map<Id, Uint8Array>()
  async get(id: Id) { return this.bytes.get(id) }
  async put(id: Id, bytes: Uint8Array) { this.bytes.set(id, bytes) }
  async delete(id: Id) { this.bytes.delete(id) }
}
