import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import bcrypt from 'bcryptjs'

const { DatabaseSync } = process.getBuiltinModule('node:sqlite') as typeof import('node:sqlite')

// Static imports are hoisted above any code in this file, so env vars needed by
// modules imported HERE would already be too late — but the app code under test
// is imported by separate test files, which Vitest loads only after this whole
// setup file (including the env assignments below) has finished running.

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dbPath = path.join(__dirname, '../data/test.db')

for (const f of [dbPath, `${dbPath}-shm`, `${dbPath}-wal`]) {
  if (fs.existsSync(f)) fs.rmSync(f)
}

process.env.DATABASE_PATH = dbPath
process.env.JWT_SECRET = 'test-secret-not-for-production'
process.env.OLLAMA_BASE_URL = 'http://localhost:11434/v1'
process.env.OLLAMA_CHAT_MODEL = 'qwen2.5:3b'
process.env.OLLAMA_EMBED_MODEL = 'nomic-embed-text'
process.env.APPROVAL_THRESHOLD_IDR = '500000'

const db = new DatabaseSync(dbPath)
db.exec('PRAGMA foreign_keys = ON;')

// Apply EVERY migration in filename order, exactly as src/db/migrate.ts does. Applying
// only the first one silently leaves the test schema behind the real one, so any feature
// added by a later migration fails here for a reason that looks nothing like the cause.
const migrationsDir = path.join(__dirname, '../src/db/migrations')
const migrationFiles = fs
  .readdirSync(migrationsDir)
  .filter((f) => f.endsWith('.sql'))
  .sort()
if (migrationFiles.length === 0) {
  throw new Error('No migration files found — run `npm run db:generate` first')
}
for (const file of migrationFiles) {
  db.exec(fs.readFileSync(path.join(migrationsDir, file), 'utf8'))
}

const passwordHash = bcrypt.hashSync('test1234', 10)

db.exec(`INSERT INTO vendors (id, name, email) VALUES (1, 'Test Vendor', 'vendor@test.com')`)
db.prepare(
  `INSERT INTO users (id, username, password_hash, display_name, role, vendor_id) VALUES (?, ?, ?, ?, ?, ?)`,
).run(1, 'supervisor', passwordHash, 'Test Supervisor', 'supervisor', null)
db.prepare(
  `INSERT INTO users (id, username, password_hash, display_name, role, vendor_id) VALUES (?, ?, ?, ?, ?, ?)`,
).run(2, 'tech1', passwordHash, 'Test Technician', 'technician', 1)

db.exec(`
  INSERT INTO machines (id, slug, name, code, area, pm_interval_label, last_pm_date, due_label, due_tone)
  VALUES (1, 'test-machine', 'Test Machine', 'MC-001', 'Test Area', 'Every 30 days', '2026-06-01', 'PM due today', 'primary')
`)
db.exec(`
  INSERT INTO checklist_items (id, machine_id, label, hint, sort_order) VALUES
    (1, 1, 'Test point A', 'hint A', 0),
    (2, 1, 'Test point B', 'hint B', 1)
`)
db.exec(`
  INSERT INTO part_catalog (category, part_name, typical_cost_idr) VALUES
    ('Damaged part', 'Test damaged part', 1850000),
    ('Needs replacement', 'Test worn part', 200000)
`)
db.exec(`INSERT INTO app_settings (key, value) VALUES ('approval_threshold_idr', '500000')`)

db.close()
