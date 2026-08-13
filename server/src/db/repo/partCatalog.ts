import { sqlite } from '../client.js'
import { camelizeRow, camelizeRows } from '../util.js'

export interface PartCatalogRow {
  id: number
  category: string
  partName: string
  typicalCostIdr: number
}

export function listCatalog() {
  return camelizeRows<PartCatalogRow>(
    sqlite.prepare('SELECT * FROM part_catalog ORDER BY category').all() as Record<string, unknown>[],
  )
}

export function getCatalogEntryForCategory(category: string) {
  return camelizeRow<PartCatalogRow>(
    sqlite.prepare('SELECT * FROM part_catalog WHERE category = ?').get(category) as
      | Record<string, unknown>
      | undefined,
  )
}

export function insertCatalogEntry(category: string, partName: string, typicalCostIdr: number) {
  sqlite
    .prepare('INSERT INTO part_catalog (category, part_name, typical_cost_idr) VALUES (?, ?, ?)')
    .run(category, partName, typicalCostIdr)
}
