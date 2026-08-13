import { sqlite } from '../client.js'
import { camelizeRow, camelizeRows } from '../util.js'

export interface UserRow {
  id: number
  username: string
  passwordHash: string
  displayName: string
  role: 'supervisor' | 'technician'
  vendorId: number | null
}

export function findUserByUsername(username: string) {
  return camelizeRow<UserRow>(
    sqlite.prepare('SELECT * FROM users WHERE username = ?').get(username) as Record<string, unknown> | undefined,
  )
}

export function findUserById(id: number) {
  return camelizeRow<UserRow>(
    sqlite.prepare('SELECT * FROM users WHERE id = ?').get(id) as Record<string, unknown> | undefined,
  )
}

export function listTechnicians() {
  return camelizeRows<{ id: number; displayName: string; vendorName: string }>(
    sqlite
      .prepare(
        `SELECT u.id, u.display_name, v.name AS vendor_name
         FROM users u JOIN vendors v ON v.id = u.vendor_id
         WHERE u.role = 'technician'
         ORDER BY v.name, u.display_name`,
      )
      .all() as Record<string, unknown>[],
  )
}

export function insertUser(u: {
  username: string
  passwordHash: string
  displayName: string
  role: 'supervisor' | 'technician'
  vendorId: number | null
}) {
  const result = sqlite
    .prepare(
      'INSERT INTO users (username, password_hash, display_name, role, vendor_id) VALUES (?, ?, ?, ?, ?)',
    )
    .run(u.username, u.passwordHash, u.displayName, u.role, u.vendorId)
  return Number(result.lastInsertRowid)
}
