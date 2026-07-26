-- Product platform schema. This reference migration documents tenant ownership,
-- immutable versions, audit history, and deletion orchestration for deployment adapters.
CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), revoked_at TEXT);
CREATE TABLE IF NOT EXISTS consents (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), version TEXT NOT NULL, jurisdiction TEXT NOT NULL, accepted_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS workspaces (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS uploads (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), workspace_id TEXT NOT NULL REFERENCES workspaces(id), source_hash TEXT, stage TEXT NOT NULL, retention_class TEXT, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS normalized_reports (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), upload_id TEXT NOT NULL REFERENCES uploads(id), parser_version TEXT NOT NULL, normalized_version INTEGER NOT NULL, payload_json TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS governance_items (id TEXT PRIMARY KEY, kind TEXT NOT NULL, jurisdiction TEXT NOT NULL, effective_from TEXT NOT NULL, status TEXT NOT NULL, payload_json TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS analyses (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), report_id TEXT NOT NULL REFERENCES normalized_reports(id), versions_json TEXT NOT NULL, payload_json TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS exports (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), report_id TEXT NOT NULL, payload_json TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS deletion_jobs (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), status TEXT NOT NULL, payload_json TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS audit_events (id TEXT PRIMARY KEY, actor_id TEXT NOT NULL, subject_id TEXT NOT NULL, event_type TEXT NOT NULL, occurred_at TEXT NOT NULL, metadata_json TEXT NOT NULL);
