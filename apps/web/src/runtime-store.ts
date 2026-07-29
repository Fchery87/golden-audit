import { existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import type { CreditAnalysisPlatform, PlatformSnapshot } from '../../../packages/platform/src/index.js'
import type { RuntimeEvent } from '../../../packages/domain/src/runtime-events.js'

const STATE_KEY = 'platform-snapshot'

export function resolveRuntimeDbPath(persistenceDir: string): string {
  if (!existsSync(persistenceDir)) mkdirSync(persistenceDir, { recursive: true })
  return join(persistenceDir, 'runtime.sqlite')
}

function openRuntimeDb(dbPath: string): DatabaseSync {
  const db = new DatabaseSync(dbPath)
  db.exec(`
    CREATE TABLE IF NOT EXISTS runtime_state (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS runtime_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kind TEXT NOT NULL,
      at TEXT NOT NULL,
      payload TEXT NOT NULL
    )
  `)
  return db
}

export function savePlatformRuntime(platform: CreditAnalysisPlatform, persistenceDir: string): void {
  const dbPath = resolveRuntimeDbPath(persistenceDir)
  const db = openRuntimeDb(dbPath)
  try {
    db.prepare(
      'INSERT INTO runtime_state (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at',
    ).run(STATE_KEY, JSON.stringify(platform.exportSnapshot()), new Date().toISOString())
  } finally {
    db.close()
  }
}

export function loadPlatformRuntime(platform: CreditAnalysisPlatform, persistenceDir: string): boolean {
  const dbPath = resolveRuntimeDbPath(persistenceDir)
  if (!existsSync(dbPath)) return false
  const db = openRuntimeDb(dbPath)
  try {
    const row = db.prepare('SELECT value FROM runtime_state WHERE key = ?').get(STATE_KEY) as { value?: string } | undefined
    if (!row?.value) return false
    platform.importSnapshot(JSON.parse(row.value) as PlatformSnapshot)
    return true
  } finally {
    db.close()
  }
}

export function appendRuntimeEvent(persistenceDir: string, event: RuntimeEvent): void {
  const dbPath = resolveRuntimeDbPath(persistenceDir)
  const db = openRuntimeDb(dbPath)
  try {
    db.prepare('INSERT INTO runtime_events (kind, at, payload) VALUES (?, ?, ?)').run(event.kind, event.at, JSON.stringify(event))
  } finally {
    db.close()
  }
}

export function readRecentRuntimeEvents(persistenceDir: string, limit = 50): RuntimeEvent[] {
  const dbPath = resolveRuntimeDbPath(persistenceDir)
  if (!existsSync(dbPath)) return []
  const db = openRuntimeDb(dbPath)
  try {
    const rows = db.prepare('SELECT payload FROM runtime_events ORDER BY id DESC LIMIT ?').all(limit) as Array<{ payload: string }>
    return rows.map(row => JSON.parse(row.payload) as RuntimeEvent)
  } finally {
    db.close()
  }
}
