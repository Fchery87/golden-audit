-- Foundation schema: version-controlled and safe to apply repeatedly.
CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS service_health_checks (
  service TEXT PRIMARY KEY,
  last_status TEXT NOT NULL,
  checked_at TEXT NOT NULL
);
