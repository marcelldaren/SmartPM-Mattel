import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { sqlite } from './client.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const migrationsDir = path.join(__dirname, 'migrations')

sqlite.exec(`
  CREATE TABLE IF NOT EXISTS _migrations (
    name TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`)

const applied = new Set(
  sqlite.prepare('SELECT name FROM _migrations').all().map((r: any) => r.name),
)

const files = fs
  .readdirSync(migrationsDir)
  .filter((f) => f.endsWith('.sql'))
  .sort()

for (const file of files) {
  if (applied.has(file)) continue
  const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8')
  console.log(`Applying migration: ${file}`)
  sqlite.exec(sql)
  sqlite.prepare('INSERT INTO _migrations (name) VALUES (?)').run(file)
}

console.log('Migrations up to date.')
