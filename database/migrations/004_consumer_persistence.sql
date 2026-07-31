-- Consumer persistence completion (docs/consumer-workflow-implementation-plan.md D5, D10).
-- 002_product_platform.sql documents tenant ownership but never created a `matches` table
-- (account matching state) or `consumer_reports` (referenced in its own header comment, never
-- defined) — analysis output had no durable home. It also omitted users.password_salt (the
-- application has always stored salt separately from the hash) and gave uploads/users narrower
-- columns than the full entity shape. This migration adds the missing tables/columns and the
-- D10 invite/session/token additions. Additive only; 002/003 are left as-is.
--
-- Full-entity rows use the same payload_json convention 002 already established for
-- normalized_reports/analyses/exports/deletion_jobs/governance_items, plus a handful of
-- indexed columns for the lookups the app actually performs (email, hash_key, report_id).
-- 002's `consents` table is left unused rather than dropped: Consent is 1:1 with its user and
-- is folded into users.payload_json instead — a separate table for it added nothing but a
-- second, redundant place for the same data to drift out of sync.

ALTER TABLE users ADD COLUMN password_salt TEXT;
ALTER TABLE users ADD COLUMN payload_json TEXT;
ALTER TABLE uploads ADD COLUMN payload_json TEXT;
ALTER TABLE uploads ADD COLUMN hash_key TEXT;
CREATE INDEX IF NOT EXISTS idx_uploads_hash_key ON uploads(hash_key);

-- Q-L3 written-authorization record (distinct from Consent — see docs/data-flow.md). 002 has
-- no table for this at all.
CREATE TABLE IF NOT EXISTS authorizations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  payload_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_authorizations_user_id ON authorizations(user_id);

CREATE TABLE IF NOT EXISTS matches (
  id TEXT PRIMARY KEY,
  report_id TEXT NOT NULL REFERENCES normalized_reports(id),
  payload_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_matches_report_id ON matches(report_id);

CREATE TABLE IF NOT EXISTS consumer_reports (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  analysis_id TEXT NOT NULL REFERENCES analyses(id),
  payload_json TEXT NOT NULL
);

-- D10: sessions become real, expiring rows rather than indefinitely-valid bearer tokens.
ALTER TABLE sessions ADD COLUMN created_at TEXT;
ALTER TABLE sessions ADD COLUMN expires_at TEXT;
ALTER TABLE sessions ADD COLUMN last_used_at TEXT;

-- D10: invite-only registration gate. A code is minted out of band by an operator and is
-- single-use; consuming it and creating the user happen in the same registration call.
CREATE TABLE IF NOT EXISTS invites (
  code TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  used_at TEXT,
  used_by_user_id TEXT REFERENCES users(id)
);

-- D10: short-lived, single-use tokens for password reset and email verification.
CREATE TABLE IF NOT EXISTS auth_tokens (
  token TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id),
  expires_at TEXT NOT NULL,
  consumed_at TEXT
);

-- D10: users gain an email-verification timestamp (nullable — verification is recorded but
-- not yet enforced as a gate on any consumer action; that is a follow-up product decision).
ALTER TABLE users ADD COLUMN email_verified_at TEXT;
