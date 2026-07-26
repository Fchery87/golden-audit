import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const databaseDirectory = join(process.cwd(), 'database', 'local')
const statePath = join(databaseDirectory, 'schema-migrations.json')
const migrationVersion = '001_foundation'

await mkdir(databaseDirectory, { recursive: true })
let applied: string[] = []
try {
  const raw = await readFile(statePath, 'utf8')
  const parsed: unknown = JSON.parse(raw)
  if (Array.isArray(parsed) && parsed.every((item): item is string => typeof item === 'string')) applied = parsed
} catch {
  // A missing state file represents a fresh isolated environment.
}
if (!applied.includes(migrationVersion)) applied.push(migrationVersion)
await writeFile(statePath, `${JSON.stringify(applied, null, 2)}\n`)
console.log(`Applied migrations: ${applied.join(', ')}`)
