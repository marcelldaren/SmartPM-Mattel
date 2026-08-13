import path from 'node:path'
import { fileURLToPath } from 'node:url'

// process.getBuiltinModule (not a static import) deliberately bypasses bundler/module
// resolution entirely — Vite's transform pipeline doesn't recognize the still-experimental
// `node:sqlite` specifier as a builtin and tries to resolve it as an npm package, which
// breaks under Vitest. A plain runtime property access is invisible to that static analysis.
const { DatabaseSync } = process.getBuiltinModule('node:sqlite') as typeof import('node:sqlite')

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dbPath = process.env.DATABASE_PATH ?? path.join(__dirname, '../../data/smartpm.db')

export const sqlite = new DatabaseSync(dbPath)
sqlite.exec('PRAGMA foreign_keys = ON;')
sqlite.exec('PRAGMA journal_mode = WAL;')

/**
 * Run `fn` inside a SQL transaction.
 *
 * node:sqlite's DatabaseSync has no `.transaction()` wrapper (that is better-sqlite3's
 * API), so the BEGIN/COMMIT/ROLLBACK is explicit. Needed wherever two writes must land
 * together — decrementing stock and closing the pull request that consumed it, for
 * instance, must never half-apply.
 */
export function inTransaction<T>(fn: () => T): T {
  sqlite.exec('BEGIN')
  try {
    const result = fn()
    sqlite.exec('COMMIT')
    return result
  } catch (err) {
    sqlite.exec('ROLLBACK')
    throw err
  }
}
