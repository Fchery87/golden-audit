import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const databaseDirectory = join(process.cwd(), 'database', 'local')
const statePath = join(databaseDirectory, 'schema-migrations.json')
const migrationVersions = ['001_foundation', '002_product_platform', '003_pilot_pages_state', '004_consumer_persistence']

await mkdir(databaseDirectory, { recursive: true })
let applied: string[] = []
try {
  const raw = await readFile(statePath, 'utf8')
  const parsed: unknown = JSON.parse(raw)
  if (Array.isArray(parsed) && parsed.every((item): item is string => typeof item === 'string')) applied = parsed
} catch {
  // A missing state file represents a fresh isolated environment.
}
for (const migrationVersion of migrationVersions) {
  if (!applied.includes(migrationVersion)) applied.push(migrationVersion)
}
await writeFile(statePath, `${JSON.stringify(applied, null, 2)}\n`)
console.log(`Applied migrations: ${applied.join(', ')}`)
