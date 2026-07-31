import type { D1Database } from '@cloudflare/workers-types'
import { randomUUID } from 'node:crypto'
import type {
  Id, User, Session, Workspace, AuthorizationRecord, Upload, CanonicalReport,
  MatchGroup, Analysis, ConsumerReport, ExportArtifact, DeletionJob, AuditEvent,
  PlatformStore, Consent,
} from '../../../../packages/platform/src/index.js'

/**
 * D1-backed PlatformStore (docs/consumer-workflow-implementation-plan.md D5). Replaces the
 * single-row whole-platform-snapshot pattern: every entity is its own row, keyed by id, so
 * concurrent users no longer clobber each other and a single upload can never blow a row's
 * size limit (raw bytes never reach this store at all — see R2BlobStore).
 *
 * Every table follows the payload_json convention 002_product_platform.sql already
 * established: the full entity as JSON, plus the handful of indexed columns the app actually
 * queries by (email, hash_key, report_id, actor_id). See database/migrations/004_consumer_persistence.sql
 * for the schema this mirrors — that file is the reference for `wrangler d1 execute` against a
 * real deployed database; this class creates the same shape directly since it always runs
 * against a fresh-or-existing D1 with CREATE TABLE IF NOT EXISTS (no incremental ALTER needed
 * for a table that doesn't yet contain rows in a shape this code didn't already write).
 */
export class D1PlatformStore implements PlatformStore {
  private schemaReady: Promise<void> | undefined

  constructor(private db: D1Database) {}

  async ensureSchema(): Promise<void> {
    if (!this.schemaReady) this.schemaReady = this.createTables()
    return this.schemaReady
  }

  private async createTables(): Promise<void> {
    const statements = [
      `CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, password_salt TEXT NOT NULL, payload_json TEXT NOT NULL, created_at TEXT NOT NULL)`,
      `CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, revoked_at TEXT, created_at TEXT NOT NULL, expires_at TEXT NOT NULL, last_used_at TEXT NOT NULL)`,
      `CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id)`,
      `CREATE TABLE IF NOT EXISTS workspaces (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, created_at TEXT NOT NULL)`,
      `CREATE TABLE IF NOT EXISTS authorizations (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, payload_json TEXT NOT NULL)`,
      `CREATE INDEX IF NOT EXISTS idx_authorizations_user_id ON authorizations(user_id)`,
      `CREATE TABLE IF NOT EXISTS uploads (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, hash_key TEXT, payload_json TEXT NOT NULL)`,
      `CREATE INDEX IF NOT EXISTS idx_uploads_hash_key ON uploads(hash_key)`,
      `CREATE TABLE IF NOT EXISTS normalized_reports (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, upload_id TEXT NOT NULL, payload_json TEXT NOT NULL)`,
      `CREATE TABLE IF NOT EXISTS matches (id TEXT PRIMARY KEY, report_id TEXT NOT NULL, payload_json TEXT NOT NULL)`,
      `CREATE INDEX IF NOT EXISTS idx_matches_report_id ON matches(report_id)`,
      `CREATE TABLE IF NOT EXISTS analyses (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, report_id TEXT NOT NULL, payload_json TEXT NOT NULL)`,
      `CREATE TABLE IF NOT EXISTS consumer_reports (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, analysis_id TEXT NOT NULL, payload_json TEXT NOT NULL)`,
      `CREATE TABLE IF NOT EXISTS exports (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, report_id TEXT NOT NULL, payload_json TEXT NOT NULL, created_at TEXT NOT NULL)`,
      `CREATE TABLE IF NOT EXISTS deletion_jobs (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, payload_json TEXT NOT NULL)`,
      `CREATE TABLE IF NOT EXISTS deletion_receipts (id TEXT PRIMARY KEY, completed_at TEXT NOT NULL, outcome TEXT NOT NULL)`,
      `CREATE TABLE IF NOT EXISTS audit_events (id TEXT PRIMARY KEY, actor_id TEXT NOT NULL, subject_id TEXT NOT NULL, event_type TEXT NOT NULL, occurred_at TEXT NOT NULL, metadata_json TEXT NOT NULL)`,
      `CREATE INDEX IF NOT EXISTS idx_audit_events_actor_id ON audit_events(actor_id)`,
      `CREATE TABLE IF NOT EXISTS invites (code TEXT PRIMARY KEY, created_at TEXT NOT NULL, used_at TEXT, used_by_user_id TEXT)`,
      `CREATE TABLE IF NOT EXISTS auth_tokens (token TEXT PRIMARY KEY, kind TEXT NOT NULL, user_id TEXT NOT NULL, expires_at TEXT NOT NULL, consumed_at TEXT)`,
    ]
    for (const statement of statements) await this.db.exec(statement)
  }

  private async first<T>(sql: string, ...params: unknown[]): Promise<T | null> {
    await this.ensureSchema()
    return this.db.prepare(sql).bind(...params).first<T>()
  }
  private async all<T>(sql: string, ...params: unknown[]): Promise<T[]> {
    await this.ensureSchema()
    const result = await this.db.prepare(sql).bind(...params).all<T>()
    return result.results
  }
  private async run(sql: string, ...params: unknown[]): Promise<{ changes: number }> {
    await this.ensureSchema()
    const result = await this.db.prepare(sql).bind(...params).run()
    return { changes: Number(result.meta.changes ?? 0) }
  }

  async getUserById(id: Id) { const row = await this.first<{ payload_json: string }>('SELECT payload_json FROM users WHERE id = ?', id); return row ? JSON.parse(row.payload_json) as User : undefined }
  async getUserByEmail(email: string) { const row = await this.first<{ payload_json: string }>('SELECT payload_json FROM users WHERE email = ?', email); return row ? JSON.parse(row.payload_json) as User : undefined }
  async createUser(user: User) { await this.run('INSERT INTO users (id, email, password_hash, password_salt, payload_json, created_at) VALUES (?, ?, ?, ?, ?, ?)', user.id, user.email, user.passwordHash, user.passwordSalt, JSON.stringify(user), new Date().toISOString()) }
  async updateUserConsent(userId: Id, consent: Consent) { const user = await this.getUserById(userId); if (!user) return; user.consent = consent; await this.run('UPDATE users SET payload_json = ? WHERE id = ?', JSON.stringify(user), userId) }
  async updateUserPassword(userId: Id, passwordHash: string, passwordSalt: string) { const user = await this.getUserById(userId); if (!user) return; user.passwordHash = passwordHash; user.passwordSalt = passwordSalt; await this.run('UPDATE users SET password_hash = ?, password_salt = ?, payload_json = ? WHERE id = ?', passwordHash, passwordSalt, JSON.stringify(user), userId) }
  async markEmailVerified(userId: Id, at: string) { const user = await this.getUserById(userId); if (!user) return; user.emailVerifiedAt = at; await this.run('UPDATE users SET payload_json = ? WHERE id = ?', JSON.stringify(user), userId) }

  async getSession(id: Id) {
    const row = await this.first<{ id: string; user_id: string; revoked_at: string | null; created_at: string; expires_at: string; last_used_at: string }>('SELECT id, user_id, revoked_at, created_at, expires_at, last_used_at FROM sessions WHERE id = ?', id)
    if (!row) return undefined
    return { id: row.id, userId: row.user_id, ...(row.revoked_at ? { revokedAt: row.revoked_at } : {}), createdAt: row.created_at, expiresAt: row.expires_at, lastUsedAt: row.last_used_at } as Session
  }
  async createSession(session: Session) { await this.run('INSERT INTO sessions (id, user_id, revoked_at, created_at, expires_at, last_used_at) VALUES (?, ?, ?, ?, ?, ?)', session.id, session.userId, session.revokedAt ?? null, session.createdAt, session.expiresAt, session.lastUsedAt) }
  async updateSession(session: Session) { await this.run('UPDATE sessions SET revoked_at = ?, last_used_at = ? WHERE id = ?', session.revokedAt ?? null, session.lastUsedAt, session.id) }
  async listActiveSessionsForUser(userId: Id) {
    const rows = await this.all<{ id: string; user_id: string; revoked_at: string | null; created_at: string; expires_at: string; last_used_at: string }>('SELECT id, user_id, revoked_at, created_at, expires_at, last_used_at FROM sessions WHERE user_id = ? AND revoked_at IS NULL', userId)
    return rows.map(row => ({ id: row.id, userId: row.user_id, createdAt: row.created_at, expiresAt: row.expires_at, lastUsedAt: row.last_used_at }) as Session)
  }

  async getWorkspace(id: Id) { const row = await this.first<{ id: string; user_id: string; created_at: string }>('SELECT id, user_id, created_at FROM workspaces WHERE id = ?', id); return row ? { id: row.id, userId: row.user_id, createdAt: row.created_at } as Workspace : undefined }
  async listWorkspacesForUser(userId: Id) { const rows = await this.all<{ id: string; user_id: string; created_at: string }>('SELECT id, user_id, created_at FROM workspaces WHERE user_id = ? ORDER BY created_at DESC', userId); return rows.map(row => ({ id: row.id, userId: row.user_id, createdAt: row.created_at }) as Workspace) }
  async createWorkspace(workspace: Workspace) { await this.run('INSERT INTO workspaces (id, user_id, created_at) VALUES (?, ?, ?)', workspace.id, workspace.userId, workspace.createdAt) }

  async getAuthorizationByUser(userId: Id) { const row = await this.first<{ payload_json: string }>('SELECT payload_json FROM authorizations WHERE user_id = ? ORDER BY rowid DESC LIMIT 1', userId); return row ? JSON.parse(row.payload_json) as AuthorizationRecord : undefined }
  async createAuthorization(record: AuthorizationRecord) { await this.run('INSERT INTO authorizations (id, user_id, payload_json) VALUES (?, ?, ?)', record.id, record.userId, JSON.stringify(record)) }

  async getUpload(id: Id) { const row = await this.first<{ payload_json: string }>('SELECT payload_json FROM uploads WHERE id = ?', id); return row ? JSON.parse(row.payload_json) as Upload : undefined }
  async getUploadIdByHash(key: string) { const row = await this.first<{ id: string }>('SELECT id FROM uploads WHERE hash_key = ?', key); return row?.id }
  async saveUpload(upload: Upload, hashKey?: string) {
    await this.run(
      'INSERT INTO uploads (id, user_id, hash_key, payload_json) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET hash_key = excluded.hash_key, payload_json = excluded.payload_json',
      upload.id, upload.userId, hashKey ?? null, JSON.stringify(upload),
    )
  }

  async getReport(id: Id) { const row = await this.first<{ payload_json: string }>('SELECT payload_json FROM normalized_reports WHERE id = ?', id); return row ? JSON.parse(row.payload_json) as CanonicalReport : undefined }
  async saveReport(report: CanonicalReport) { await this.run('INSERT INTO normalized_reports (id, user_id, upload_id, payload_json) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET payload_json = excluded.payload_json', report.id, report.userId, report.uploadId, JSON.stringify(report)) }

  async getMatch(id: Id) { const row = await this.first<{ payload_json: string }>('SELECT payload_json FROM matches WHERE id = ?', id); return row ? JSON.parse(row.payload_json) as MatchGroup : undefined }
  async saveMatch(match: MatchGroup) { await this.run('INSERT INTO matches (id, report_id, payload_json) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET payload_json = excluded.payload_json', match.id, match.reportId, JSON.stringify(match)) }
  async listMatchesByReport(reportId: Id) { const rows = await this.all<{ payload_json: string }>('SELECT payload_json FROM matches WHERE report_id = ?', reportId); return rows.map(row => JSON.parse(row.payload_json) as MatchGroup) }

  async getAnalysis(id: Id) { const row = await this.first<{ payload_json: string }>('SELECT payload_json FROM analyses WHERE id = ?', id); return row ? JSON.parse(row.payload_json) as Analysis : undefined }
  async saveAnalysis(analysis: Analysis) { await this.run('INSERT INTO analyses (id, user_id, report_id, payload_json) VALUES (?, ?, ?, ?)', analysis.id, analysis.userId, analysis.reportId, JSON.stringify(analysis)) }

  async getConsumerReport(id: Id) { const row = await this.first<{ payload_json: string }>('SELECT payload_json FROM consumer_reports WHERE id = ?', id); return row ? JSON.parse(row.payload_json) as ConsumerReport : undefined }
  async listConsumerReportsForUser(userId: Id) { const rows = await this.all<{ payload_json: string }>('SELECT payload_json FROM consumer_reports WHERE user_id = ? ORDER BY rowid DESC', userId); return rows.map(row => JSON.parse(row.payload_json) as ConsumerReport) }
  async saveConsumerReport(report: ConsumerReport) { await this.run('INSERT INTO consumer_reports (id, user_id, analysis_id, payload_json) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET payload_json = excluded.payload_json', report.id, report.userId, report.analysisId, JSON.stringify(report)) }

  async getExport(id: Id) { const row = await this.first<{ payload_json: string }>('SELECT payload_json FROM exports WHERE id = ?', id); return row ? JSON.parse(row.payload_json) as ExportArtifact : undefined }
  async saveExport(artifact: ExportArtifact) { await this.run('INSERT INTO exports (id, user_id, report_id, payload_json, created_at) VALUES (?, ?, ?, ?, ?)', artifact.id, artifact.userId, artifact.reportId, JSON.stringify(artifact), artifact.createdAt) }
  async findExportByReport(userId: Id, reportId: Id) { const row = await this.first<{ payload_json: string }>('SELECT payload_json FROM exports WHERE user_id = ? AND report_id = ? LIMIT 1', userId, reportId); return row ? JSON.parse(row.payload_json) as ExportArtifact : undefined }

  async saveDeletionJob(job: DeletionJob) { await this.run('INSERT INTO deletion_jobs (id, user_id, payload_json) VALUES (?, ?, ?)', job.id, job.userId, JSON.stringify(job)) }
  async saveDeletionReceipt(receipt: { id: Id; completedAt: string; outcome: 'account-deleted' }) { await this.run('INSERT INTO deletion_receipts (id, completed_at, outcome) VALUES (?, ?, ?)', receipt.id, receipt.completedAt, receipt.outcome) }
  async deleteAllUserData(userId: Id): Promise<string[]> {
    const deleted: string[] = []
    const uploads = await this.all<{ id: string }>('SELECT id FROM uploads WHERE user_id = ?', userId)
    for (const row of uploads) deleted.push(`uploads:${row.id}`)
    const reports = await this.all<{ id: string }>('SELECT id FROM normalized_reports WHERE user_id = ?', userId)
    for (const row of reports) deleted.push(`reports:${row.id}`)
    for (const report of reports) {
      const matches = await this.all<{ id: string }>('SELECT id FROM matches WHERE report_id = ?', report.id)
      for (const row of matches) deleted.push(`matches:${row.id}`)
      await this.run('DELETE FROM matches WHERE report_id = ?', report.id)
    }
    const analyses = await this.all<{ id: string }>('SELECT id FROM analyses WHERE user_id = ?', userId)
    for (const row of analyses) deleted.push(`analyses:${row.id}`)
    const consumerReports = await this.all<{ id: string }>('SELECT id FROM consumer_reports WHERE user_id = ?', userId)
    for (const row of consumerReports) deleted.push(`consumer-reports:${row.id}`)
    const exports = await this.all<{ id: string }>('SELECT id FROM exports WHERE user_id = ?', userId)
    for (const row of exports) deleted.push(`exports:${row.id}`)
    await this.run('DELETE FROM uploads WHERE user_id = ?', userId)
    await this.run('DELETE FROM normalized_reports WHERE user_id = ?', userId)
    await this.run('DELETE FROM analyses WHERE user_id = ?', userId)
    await this.run('DELETE FROM consumer_reports WHERE user_id = ?', userId)
    await this.run('DELETE FROM exports WHERE user_id = ?', userId)
    return deleted
  }
  async deleteAccount(userId: Id) {
    for (const statement of ['DELETE FROM sessions WHERE user_id = ?', 'DELETE FROM workspaces WHERE user_id = ?', 'DELETE FROM authorizations WHERE user_id = ?', 'DELETE FROM auth_tokens WHERE user_id = ?', 'DELETE FROM deletion_jobs WHERE user_id = ?', 'DELETE FROM users WHERE id = ?']) await this.run(statement, userId)
    await this.run('DELETE FROM audit_events WHERE actor_id = ? OR subject_id = ?', userId, userId)
  }

  async appendAuditEvent(event: AuditEvent & { id: Id }) { await this.run('INSERT INTO audit_events (id, actor_id, subject_id, event_type, occurred_at, metadata_json) VALUES (?, ?, ?, ?, ?, ?)', event.id, event.actorId, event.subjectId, event.type, event.at, JSON.stringify(event.metadata)) }
  async listAuditEventsForActor(actorId: Id) {
    const rows = await this.all<{ actor_id: string; subject_id: string; event_type: string; occurred_at: string; metadata_json: string }>('SELECT actor_id, subject_id, event_type, occurred_at, metadata_json FROM audit_events WHERE actor_id = ? ORDER BY occurred_at ASC', actorId)
    return rows.map(row => ({ type: row.event_type, actorId: row.actor_id, subjectId: row.subject_id, at: row.occurred_at, metadata: JSON.parse(row.metadata_json) as Record<string, string> }) as AuditEvent)
  }

  async listAllUsers() { const rows = await this.all<{ payload_json: string }>('SELECT payload_json FROM users'); return rows.map(row => JSON.parse(row.payload_json) as User) }
  async listAllUploads() { const rows = await this.all<{ payload_json: string }>('SELECT payload_json FROM uploads'); return rows.map(row => JSON.parse(row.payload_json) as Upload) }
  async listAllReports() { const rows = await this.all<{ payload_json: string }>('SELECT payload_json FROM normalized_reports'); return rows.map(row => JSON.parse(row.payload_json) as CanonicalReport) }
  async listAllMatches() { const rows = await this.all<{ payload_json: string }>('SELECT payload_json FROM matches'); return rows.map(row => JSON.parse(row.payload_json) as MatchGroup) }
  async listAllAnalyses() { const rows = await this.all<{ payload_json: string }>('SELECT payload_json FROM analyses'); return rows.map(row => JSON.parse(row.payload_json) as Analysis) }

  async getInvite(code: string) {
    const row = await this.first<{ code: string; created_at: string; used_at: string | null; used_by_user_id: string | null }>('SELECT code, created_at, used_at, used_by_user_id FROM invites WHERE code = ?', code)
    if (!row) return undefined
    return { code: row.code, createdAt: row.created_at, ...(row.used_at ? { usedAt: row.used_at } : {}), ...(row.used_by_user_id ? { usedByUserId: row.used_by_user_id } : {}) }
  }
  async createInvite(code: string, createdAt: string) { await this.run('INSERT INTO invites (code, created_at) VALUES (?, ?)', code, createdAt) }
  async consumeInvite(code: string, usedByUserId: Id, usedAt: string) {
    // Atomic single-use check: the WHERE clause only matches an unconsumed code, so meta.changes
    // tells us — from this one statement — whether we were the caller who consumed it.
    const result = await this.run('UPDATE invites SET used_at = ?, used_by_user_id = ? WHERE code = ? AND used_at IS NULL', usedAt, usedByUserId, code)
    return result.changes > 0
  }

  async createToken(kind: 'password-reset' | 'email-verify', token: string, userId: Id, expiresAt: string) { await this.run('INSERT INTO auth_tokens (token, kind, user_id, expires_at) VALUES (?, ?, ?, ?)', token, kind, userId, expiresAt) }
  async consumeToken(kind: 'password-reset' | 'email-verify', token: string) {
    // Atomic single-use check, same pattern as consumeInvite: the WHERE clause only matches an
    // unconsumed token, so meta.changes tells us whether this call is the one that consumed it.
    const result = await this.run('UPDATE auth_tokens SET consumed_at = ? WHERE token = ? AND kind = ? AND consumed_at IS NULL', new Date().toISOString(), token, kind)
    if (result.changes === 0) return undefined
    const row = await this.first<{ user_id: string; expires_at: string }>('SELECT user_id, expires_at FROM auth_tokens WHERE token = ?', token)
    if (!row || Date.parse(row.expires_at) <= Date.now()) return undefined
    return { userId: row.user_id }
  }
}

export { randomUUID }
