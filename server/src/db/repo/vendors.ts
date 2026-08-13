import { sqlite } from '../client.js'
import { camelizeRow, camelizeRows } from '../util.js'

export interface VendorRow {
  id: number
  name: string
  email: string
}

export function listVendors() {
  return camelizeRows<VendorRow>(sqlite.prepare('SELECT * FROM vendors ORDER BY name').all() as Record<string, unknown>[])
}

export function getVendorById(id: number) {
  return camelizeRow<VendorRow>(
    sqlite.prepare('SELECT * FROM vendors WHERE id = ?').get(id) as Record<string, unknown> | undefined,
  )
}

export function getVendorByName(name: string) {
  return camelizeRow<VendorRow>(
    sqlite.prepare('SELECT * FROM vendors WHERE name = ?').get(name) as Record<string, unknown> | undefined,
  )
}

export function insertVendor(name: string, email: string) {
  const result = sqlite.prepare('INSERT INTO vendors (name, email) VALUES (?, ?)').run(name, email)
  return Number(result.lastInsertRowid)
}
