-- Cloudflare Pages pilot state schema.
-- Stores the serialized pilot platform snapshot used by Pages Functions on D1.
CREATE TABLE IF NOT EXISTS pilot_state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
