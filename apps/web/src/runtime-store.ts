import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import type {
  Id, User, Session, Workspace, AuthorizationRecord, Upload, CanonicalReport,
  MatchGroup, Analysis, ConsumerReport, ExportArtifact, DeletionJob, AuditEvent,
  PlatformStore, BlobStore, Consent,
} from '../../../packages/platform/src/index.js'
import type { RuntimeEvent } from '../../../packages/domain/src/runtime-events.js'

export function resolveRuntimeDbPath(persistenceDir: string): string {
  if (!existsSync(persistenceDir)) mkdirSync(persistenceDir, { recursive: true })
  return join(persistenceDir, 'runtime.sqlite')
}

/**
 * node:sqlite-backed PlatformStore for local Node dev (docs/consumer-workflow-implementation-plan.md
 * D5). Same per-row, real-per-entity design as D1PlatformStore — the point of D5 is that both
 * backends share one architecture, not that Cloudflare gets it and local dev keeps the old
 * whole-snapshot-in-one-row pattern. One connection held for the process lifetime (server.ts
 * constructs this once at startup, not per-request), unlike the open/close-per-call pattern the
 * old snapshot functions used — this is both simpler and avoids per-request file-open overhead.
 */
export class SqlitePlatformStore implements PlatformStore {
  private db: DatabaseSync

  constructor(dbPath: string) {
    this.db = new DatabaseSync(dbPath)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, password_salt TEXT NOT NULL, payload_json TEXT NOT NULL, created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, revoked_at TEXT, created_at TEXT NOT NULL, expires_at TEXT NOT NULL, last_used_at TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
      CREATE TABLE IF NOT EXISTS workspaces (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS authorizations (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, payload_json TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS idx_authorizations_user_id ON authorizations(user_id);
      CREATE TABLE IF NOT EXISTS uploads (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, hash_key TEXT, payload_json TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS idx_uploads_hash_key ON uploads(hash_key);
      CREATE TABLE IF NOT EXISTS normalized_reports (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, upload_id TEXT NOT NULL, payload_json TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS matches (id TEXT PRIMARY KEY, report_id TEXT NOT NULL, payload_json TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS idx_matches_report_id ON matches(report_id);
      CREATE TABLE IF NOT EXISTS analyses (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, report_id TEXT NOT NULL, payload_json TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS consumer_reports (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, analysis_id TEXT NOT NULL, payload_json TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS exports (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, report_id TEXT NOT NULL, payload_json TEXT NOT NULL, created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS deletion_jobs (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, payload_json TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS audit_events (id TEXT PRIMARY KEY, actor_id TEXT NOT NULL, subject_id TEXT NOT NULL, event_type TEXT NOT NULL, occurred_at TEXT NOT NULL, metadata_json TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS idx_audit_events_actor_id ON audit_events(actor_id);
      CREATE TABLE IF NOT EXISTS invites (code TEXT PRIMARY KEY, created_at TEXT NOT NULL, used_at TEXT, used_by_user_id TEXT);
      CREATE TABLE IF NOT EXISTS auth_tokens (token TEXT PRIMARY KEY, kind TEXT NOT NULL, user_id TEXT NOT NULL, expires_at TEXT NOT NULL, consumed_at TEXT);
    `)
  }

  close(): void { this.db.close() }

  async getUserById(id: Id) { const row = this.db.prepare('SELECT payload_json FROM users WHERE id = ?').get(id) as { payload_json: string } | undefined; return row ? JSON.parse(row.payload_json) as User : undefined }
  async getUserByEmail(email: string) { const row = this.db.prepare('SELECT payload_json FROM users WHERE email = ?').get(email) as { payload_json: string } | undefined; return row ? JSON.parse(row.payload_json) as User : undefined }
  async createUser(user: User) { this.db.prepare('INSERT INTO users (id, email, password_hash, password_salt, payload_json, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(user.id, user.email, user.passwordHash, user.passwordSalt, JSON.stringify(user), new Date().toISOString()) }
  async updateUserConsent(userId: Id, consent: Consent) { const user = await this.getUserById(userId); if (!user) return; user.consent = consent; this.db.prepare('UPDATE users SET payload_json = ? WHERE id = ?').run(JSON.stringify(user), userId) }
  async updateUserPassword(userId: Id, passwordHash: string, passwordSalt: string) { const user = await this.getUserById(userId); if (!user) return; user.passwordHash = passwordHash; user.passwordSalt = passwordSalt; this.db.prepare('UPDATE users SET password_hash = ?, password_salt = ?, payload_json = ? WHERE id = ?').run(passwordHash, passwordSalt, JSON.stringify(user), userId) }
  async markEmailVerified(userId: Id, at: string) { const user = await this.getUserById(userId); if (!user) return; user.emailVerifiedAt = at; this.db.prepare('UPDATE users SET payload_json = ? WHERE id = ?').run(JSON.stringify(user), userId) }

  async getSession(id: Id) {
    const row = this.db.prepare('SELECT id, user_id, revoked_at, created_at, expires_at, last_used_at FROM sessions WHERE id = ?').get(id) as { id: string; user_id: string; revoked_at: string | null; created_at: string; expires_at: string; last_used_at: string } | undefined
    if (!row) return undefined
    return { id: row.id, userId: row.user_id, ...(row.revoked_at ? { revokedAt: row.revoked_at } : {}), createdAt: row.created_at, expiresAt: row.expires_at, lastUsedAt: row.last_used_at } as Session
  }
  async createSession(session: Session) { this.db.prepare('INSERT INTO sessions (id, user_id, revoked_at, created_at, expires_at, last_used_at) VALUES (?, ?, ?, ?, ?, ?)').run(session.id, session.userId, session.revokedAt ?? null, session.createdAt, session.expiresAt, session.lastUsedAt) }
  async updateSession(session: Session) { this.db.prepare('UPDATE sessions SET revoked_at = ?, last_used_at = ? WHERE id = ?').run(session.revokedAt ?? null, session.lastUsedAt, session.id) }
  async listActiveSessionsForUser(userId: Id) {
    const rows = this.db.prepare('SELECT id, user_id, created_at, expires_at, last_used_at FROM sessions WHERE user_id = ? AND revoked_at IS NULL').all(userId) as Array<{ id: string; user_id: string; created_at: string; expires_at: string; last_used_at: string }>
    return rows.map(row => ({ id: row.id, userId: row.user_id, createdAt: row.created_at, expiresAt: row.expires_at, lastUsedAt: row.last_used_at }) as Session)
  }

  async getWorkspace(id: Id) { const row = this.db.prepare('SELECT id, user_id, created_at FROM workspaces WHERE id = ?').get(id) as { id: string; user_id: string; created_at: string } | undefined; return row ? { id: row.id, userId: row.user_id, createdAt: row.created_at } as Workspace : undefined }
  async createWorkspace(workspace: Workspace) { this.db.prepare('INSERT INTO workspaces (id, user_id, created_at) VALUES (?, ?, ?)').run(workspace.id, workspace.userId, workspace.createdAt) }

  async getAuthorizationByUser(userId: Id) { const row = this.db.prepare('SELECT payload_json FROM authorizations WHERE user_id = ? ORDER BY rowid DESC LIMIT 1').get(userId) as { payload_json: string } | undefined; return row ? JSON.parse(row.payload_json) as AuthorizationRecord : undefined }
  async createAuthorization(record: AuthorizationRecord) { this.db.prepare('INSERT INTO authorizations (id, user_id, payload_json) VALUES (?, ?, ?)').run(record.id, record.userId, JSON.stringify(record)) }

  async getUpload(id: Id) { const row = this.db.prepare('SELECT payload_json FROM uploads WHERE id = ?').get(id) as { payload_json: string } | undefined; return row ? JSON.parse(row.payload_json) as Upload : undefined }
  async getUploadIdByHash(key: string) { const row = this.db.prepare('SELECT id FROM uploads WHERE hash_key = ?').get(key) as { id: string } | undefined; return row?.id }
  async saveUpload(upload: Upload, hashKey?: string) { this.db.prepare('INSERT INTO uploads (id, user_id, hash_key, payload_json) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET hash_key = excluded.hash_key, payload_json = excluded.payload_json').run(upload.id, upload.userId, hashKey ?? null, JSON.stringify(upload)) }

  async getReport(id: Id) { const row = this.db.prepare('SELECT payload_json FROM normalized_reports WHERE id = ?').get(id) as { payload_json: string } | undefined; return row ? JSON.parse(row.payload_json) as CanonicalReport : undefined }
  async saveReport(report: CanonicalReport) { this.db.prepare('INSERT INTO normalized_reports (id, user_id, upload_id, payload_json) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET payload_json = excluded.payload_json').run(report.id, report.userId, report.uploadId, JSON.stringify(report)) }

  async getMatch(id: Id) { const row = this.db.prepare('SELECT payload_json FROM matches WHERE id = ?').get(id) as { payload_json: string } | undefined; return row ? JSON.parse(row.payload_json) as MatchGroup : undefined }
  async saveMatch(match: MatchGroup) { this.db.prepare('INSERT INTO matches (id, report_id, payload_json) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET payload_json = excluded.payload_json').run(match.id, match.reportId, JSON.stringify(match)) }
  async listMatchesByReport(reportId: Id) { const rows = this.db.prepare('SELECT payload_json FROM matches WHERE report_id = ?').all(reportId) as Array<{ payload_json: string }>; return rows.map(row => JSON.parse(row.payload_json) as MatchGroup) }

  async getAnalysis(id: Id) { const row = this.db.prepare('SELECT payload_json FROM analyses WHERE id = ?').get(id) as { payload_json: string } | undefined; return row ? JSON.parse(row.payload_json) as Analysis : undefined }
  async saveAnalysis(analysis: Analysis) { this.db.prepare('INSERT INTO analyses (id, user_id, report_id, payload_json) VALUES (?, ?, ?, ?)').run(analysis.id, analysis.userId, analysis.reportId, JSON.stringify(analysis)) }

  async getConsumerReport(id: Id) { const row = this.db.prepare('SELECT payload_json FROM consumer_reports WHERE id = ?').get(id) as { payload_json: string } | undefined; return row ? JSON.parse(row.payload_json) as ConsumerReport : undefined }
  async saveConsumerReport(report: ConsumerReport) { this.db.prepare('INSERT INTO consumer_reports (id, user_id, analysis_id, payload_json) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET payload_json = excluded.payload_json').run(report.id, report.userId, report.analysisId, JSON.stringify(report)) }

  async getExport(id: Id) { const row = this.db.prepare('SELECT payload_json FROM exports WHERE id = ?').get(id) as { payload_json: string } | undefined; return row ? JSON.parse(row.payload_json) as ExportArtifact : undefined }
  async saveExport(artifact: ExportArtifact) { this.db.prepare('INSERT INTO exports (id, user_id, report_id, payload_json, created_at) VALUES (?, ?, ?, ?, ?)').run(artifact.id, artifact.userId, artifact.reportId, JSON.stringify(artifact), artifact.createdAt) }
  async findExportByReport(userId: Id, reportId: Id) { const row = this.db.prepare('SELECT payload_json FROM exports WHERE user_id = ? AND report_id = ? LIMIT 1').get(userId, reportId) as { payload_json: string } | undefined; return row ? JSON.parse(row.payload_json) as ExportArtifact : undefined }

  async saveDeletionJob(job: DeletionJob) { this.db.prepare('INSERT INTO deletion_jobs (id, user_id, payload_json) VALUES (?, ?, ?)').run(job.id, job.userId, JSON.stringify(job)) }
  async deleteAllUserData(userId: Id): Promise<string[]> {
    const deleted: string[] = []
    const uploads = this.db.prepare('SELECT id FROM uploads WHERE user_id = ?').all(userId) as Array<{ id: string }>
    for (const row of uploads) deleted.push(`uploads:${row.id}`)
    const reports = this.db.prepare('SELECT id FROM normalized_reports WHERE user_id = ?').all(userId) as Array<{ id: string }>
    for (const row of reports) deleted.push(`reports:${row.id}`)
    for (const report of reports) {
      const matches = this.db.prepare('SELECT id FROM matches WHERE report_id = ?').all(report.id) as Array<{ id: string }>
      for (const row of matches) deleted.push(`matches:${row.id}`)
      this.db.prepare('DELETE FROM matches WHERE report_id = ?').run(report.id)
    }
    const analyses = this.db.prepare('SELECT id FROM analyses WHERE user_id = ?').all(userId) as Array<{ id: string }>
    for (const row of analyses) deleted.push(`analyses:${row.id}`)
    const consumerReports = this.db.prepare('SELECT id FROM consumer_reports WHERE user_id = ?').all(userId) as Array<{ id: string }>
    for (const row of consumerReports) deleted.push(`consumer-reports:${row.id}`)
    const exportsFound = this.db.prepare('SELECT id FROM exports WHERE user_id = ?').all(userId) as Array<{ id: string }>
    for (const row of exportsFound) deleted.push(`exports:${row.id}`)
    this.db.prepare('DELETE FROM uploads WHERE user_id = ?').run(userId)
    this.db.prepare('DELETE FROM normalized_reports WHERE user_id = ?').run(userId)
    this.db.prepare('DELETE FROM analyses WHERE user_id = ?').run(userId)
    this.db.prepare('DELETE FROM consumer_reports WHERE user_id = ?').run(userId)
    this.db.prepare('DELETE FROM exports WHERE user_id = ?').run(userId)
    return deleted
  }

  async appendAuditEvent(event: AuditEvent & { id: Id }) { this.db.prepare('INSERT INTO audit_events (id, actor_id, subject_id, event_type, occurred_at, metadata_json) VALUES (?, ?, ?, ?, ?, ?)').run(event.id, event.actorId, event.subjectId, event.type, event.at, JSON.stringify(event.metadata)) }
  async listAuditEventsForActor(actorId: Id) {
    const rows = this.db.prepare('SELECT actor_id, subject_id, event_type, occurred_at, metadata_json FROM audit_events WHERE actor_id = ? ORDER BY occurred_at ASC').all(actorId) as Array<{ actor_id: string; subject_id: string; event_type: string; occurred_at: string; metadata_json: string }>
    return rows.map(row => ({ type: row.event_type, actorId: row.actor_id, subjectId: row.subject_id, at: row.occurred_at, metadata: JSON.parse(row.metadata_json) as Record<string, string> }) as AuditEvent)
  }

  async listAllUsers() { const rows = this.db.prepare('SELECT payload_json FROM users').all() as Array<{ payload_json: string }>; return rows.map(row => JSON.parse(row.payload_json) as User) }
  async listAllUploads() { const rows = this.db.prepare('SELECT payload_json FROM uploads').all() as Array<{ payload_json: string }>; return rows.map(row => JSON.parse(row.payload_json) as Upload) }
  async listAllReports() { const rows = this.db.prepare('SELECT payload_json FROM normalized_reports').all() as Array<{ payload_json: string }>; return rows.map(row => JSON.parse(row.payload_json) as CanonicalReport) }
  async listAllMatches() { const rows = this.db.prepare('SELECT payload_json FROM matches').all() as Array<{ payload_json: string }>; return rows.map(row => JSON.parse(row.payload_json) as MatchGroup) }
  async listAllAnalyses() { const rows = this.db.prepare('SELECT payload_json FROM analyses').all() as Array<{ payload_json: string }>; return rows.map(row => JSON.parse(row.payload_json) as Analysis) }

  async getInvite(code: string) {
    const row = this.db.prepare('SELECT code, created_at, used_at, used_by_user_id FROM invites WHERE code = ?').get(code) as { code: string; created_at: string; used_at: string | null; used_by_user_id: string | null } | undefined
    if (!row) return undefined
    return { code: row.code, createdAt: row.created_at, ...(row.used_at ? { usedAt: row.used_at } : {}), ...(row.used_by_user_id ? { usedByUserId: row.used_by_user_id } : {}) }
  }
  async createInvite(code: string, createdAt: string) { this.db.prepare('INSERT INTO invites (code, created_at) VALUES (?, ?)').run(code, createdAt) }
  async consumeInvite(code: string, usedByUserId: Id, usedAt: string) {
    const result = this.db.prepare('UPDATE invites SET used_at = ?, used_by_user_id = ? WHERE code = ? AND used_at IS NULL').run(usedAt, usedByUserId, code)
    return Number(result.changes) > 0
  }

  async createToken(kind: 'password-reset' | 'email-verify', token: string, userId: Id, expiresAt: string) { this.db.prepare('INSERT INTO auth_tokens (token, kind, user_id, expires_at) VALUES (?, ?, ?, ?)').run(token, kind, userId, expiresAt) }
  async consumeToken(kind: 'password-reset' | 'email-verify', token: string) {
    const result = this.db.prepare('UPDATE auth_tokens SET consumed_at = ? WHERE token = ? AND kind = ? AND consumed_at IS NULL').run(new Date().toISOString(), token, kind)
    if (Number(result.changes) === 0) return undefined
    const row = this.db.prepare('SELECT user_id, expires_at FROM auth_tokens WHERE token = ?').get(token) as { user_id: string; expires_at: string } | undefined
    if (!row || Date.parse(row.expires_at) <= Date.now()) return undefined
    return { userId: row.user_id }
  }
}

/** Raw upload bytes never touch the SQLite store (D5) — one file per upload under
 *  <persistenceDir>/uploads/, the local-dev analogue of R2. */
export class FileBlobStore implements BlobStore {
  private dir: string
  constructor(persistenceDir: string) {
    this.dir = join(persistenceDir, 'uploads')
    if (!existsSync(this.dir)) mkdirSync(this.dir, { recursive: true })
  }
  private path(id: Id): string { return join(this.dir, id) }
  async get(id: Id) { const p = this.path(id); return existsSync(p) ? new Uint8Array(readFileSync(p)) : undefined }
  async put(id: Id, bytes: Uint8Array) { writeFileSync(this.path(id), bytes) }
  async delete(id: Id) { const p = this.path(id); if (existsSync(p)) unlinkSync(p) }
}

// --- Deploy-level runtime events (separate from platform AuditEvent — tracks things like
// persistence failures and pilot-stage transitions for the admin dashboard's event feed). ---

function openEventsDb(persistenceDir: string): DatabaseSync {
  const dbPath = resolveRuntimeDbPath(persistenceDir)
  const db = new DatabaseSync(dbPath)
  db.exec(`CREATE TABLE IF NOT EXISTS runtime_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kind TEXT NOT NULL,
    at TEXT NOT NULL,
    payload TEXT NOT NULL
  )`)
  return db
}

export function appendRuntimeEvent(persistenceDir: string, event: RuntimeEvent): void {
  const db = openEventsDb(persistenceDir)
  try {
    db.prepare('INSERT INTO runtime_events (kind, at, payload) VALUES (?, ?, ?)').run(event.kind, event.at, JSON.stringify(event))
  } finally {
    db.close()
  }
}

export function readRecentRuntimeEvents(persistenceDir: string, limit = 50): RuntimeEvent[] {
  const dbPath = resolveRuntimeDbPath(persistenceDir)
  if (!existsSync(dbPath)) return []
  const db = openEventsDb(persistenceDir)
  try {
    const rows = db.prepare('SELECT payload FROM runtime_events ORDER BY id DESC LIMIT ?').all(limit) as Array<{ payload: string }>
    return rows.map(row => JSON.parse(row.payload) as RuntimeEvent)
  } finally {
    db.close()
  }
}
