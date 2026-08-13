import { inTransaction, sqlite } from '../client.js'
import { camelizeRow, camelizeRows } from '../util.js'

/**
 * Warehouse stock and the internal pull requests that draw on it.
 *
 * Everything in this file is plain SQL by design. Whether a part is on the shelf is a
 * fact the database already holds; it is never a model decision, and the agent that
 * drafts vendor emails is only reached when this file says there is nothing to pull.
 */

export type StockLevel = 'healthy' | 'low' | 'out'

export interface WarehousePartRow {
  id: number
  sku: string
  partName: string
  category: string
  machineId: number | null
  checklistItemId: number | null
  quantityOnHand: number
  reorderThreshold: number
  maxQuantity: number
  binLocation: string
  unitCostIdr: number | null
  needsRecount: boolean
  recountNote: string | null
  updatedAt: string | null
}

export interface WarehousePartView extends WarehousePartRow {
  machineName: string | null
  machineCode: string | null
  /** Units already promised to open pull requests but not yet collected. */
  reserved: number
  /** quantityOnHand - reserved. What a new request can actually claim. */
  available: number
  level: StockLevel
}

/**
 * Stock level from the shelf count, not the available count.
 *
 * A part with 6 on hand and 6 reserved is not "out of stock" — it is fully spoken for,
 * which is a different problem with a different fix. The bar shows what is physically
 * there; `reserved` is surfaced separately.
 */
export function levelFor(quantityOnHand: number, reorderThreshold: number): StockLevel {
  if (quantityOnHand <= 0) return 'out'
  return quantityOnHand <= reorderThreshold ? 'low' : 'healthy'
}

const SELECT_VIEW = `
  SELECT w.*,
         m.name AS machine_name,
         m.code AS machine_code,
         COALESCE((
           SELECT SUM(ipr.quantity) FROM internal_pull_requests ipr
           WHERE ipr.warehouse_part_id = w.id AND ipr.status = 'pending_pickup'
         ), 0) AS reserved
  FROM warehouse_parts w
  LEFT JOIN machines m ON m.id = w.machine_id
`

function toView(row: Record<string, unknown>): WarehousePartView {
  const r = camelizeRow<WarehousePartView>(row)!
  const reserved = Number(r.reserved ?? 0)
  return {
    ...r,
    needsRecount: Boolean(r.needsRecount),
    reserved,
    available: Math.max(0, r.quantityOnHand - reserved),
    level: levelFor(r.quantityOnHand, r.reorderThreshold),
  }
}

export function listWarehouseParts(): WarehousePartView[] {
  const rows = sqlite.prepare(`${SELECT_VIEW} ORDER BY w.sku`).all() as Record<string, unknown>[]
  return rows.map(toView)
}

export function getWarehousePart(id: number): WarehousePartView | undefined {
  const row = sqlite.prepare(`${SELECT_VIEW} WHERE w.id = ?`).get(id) as Record<string, unknown> | undefined
  return row ? toView(row) : undefined
}

/**
 * Find stock that can satisfy a finding, most specific match first.
 *
 * Ranked rather than filtered so the choice is deterministic and explainable:
 *   1. bound to this exact inspection point
 *   2. bound to this machine but no particular point, same finding category
 *   3. a general consumable (machine_id NULL) in the same category
 *
 * How far a row's scope reaches is decided by how it was catalogued, and a row pinned to
 * an inspection point reaches exactly that point and no further. Widening tiers 2 and 3 to
 * include pinned rows was the source of a real routing fault: a "Tool changer alignment /
 * Damaged part" finding, whose own part was out of stock, matched the Way Cover Wiper Set
 * on tier 2 — same machine, same category, entirely the wrong component — and reserved it
 * instead of falling through to the vendor. Breadth of scope has to be stated in the
 * catalogue, never inferred from the absence of a better match.
 *
 * The right outcome when only the wrong part is on the shelf is no match at all, which
 * hands the finding to the vendor-drafting path. An unnecessary purchase order is a
 * correctable mistake; sending a technician to a bin for a component that cannot fix the
 * fault costs a trip and buys nothing.
 *
 * `available` (on hand minus units already promised to open pull requests) is what is
 * tested, not `quantity_on_hand`. Pull requests intentionally do not decrement stock
 * until pickup is confirmed, so without reservations two findings in the same submission
 * could both be told to collect the last remaining unit.
 */
export function findAvailableStock(opts: {
  category: string
  machineId: number
  checklistItemId: number
  quantity?: number
}): WarehousePartView | undefined {
  const need = opts.quantity ?? 1
  const rows = sqlite
    .prepare(
      `${SELECT_VIEW}
       WHERE w.category = ?
         AND (
           w.checklist_item_id = ?
           OR (w.checklist_item_id IS NULL AND (w.machine_id = ? OR w.machine_id IS NULL))
         )
       ORDER BY
         CASE WHEN w.checklist_item_id = ? THEN 0
              WHEN w.machine_id = ?        THEN 1
              ELSE 2 END,
         w.sku`,
    )
    .all(opts.category, opts.checklistItemId, opts.machineId, opts.checklistItemId, opts.machineId) as Record<
    string,
    unknown
  >[]

  return rows.map(toView).find((p) => p.available >= need)
}

// --- Internal pull requests -----------------------------------------------------------

export interface PullRequestRow {
  id: number
  code: string
  warehousePartId: number
  findingId: number | null
  checksheetId: number
  machineId: number
  technicianUserId: number
  partName: string
  sku: string
  binLocation: string
  quantity: number
  status: 'pending_pickup' | 'picked_up' | 'discrepancy' | 'cancelled'
  itemLabel: string | null
  category: string | null
  note: string | null
  createdAt: string
  resolvedAt: string | null
  resolvedByUserId: number | null
}

export interface PullRequestView extends PullRequestRow {
  machine: string
  machineCode: string
  technician: string
  sheet: string
  quantityOnHand: number
  needsRecount: boolean
}

export function nextPullRequestCode(): string {
  const row = sqlite.prepare('SELECT COUNT(*) AS n FROM internal_pull_requests').get() as { n: number }
  return `IPR-${101 + row.n}`
}

export function insertPullRequest(p: {
  warehousePartId: number
  findingId: number | null
  checksheetId: number
  machineId: number
  technicianUserId: number
  partName: string
  sku: string
  binLocation: string
  quantity: number
  itemLabel: string | null
  category: string | null
  note: string | null
  createdAt: string
  isSeed?: boolean
}): string {
  const code = nextPullRequestCode()
  sqlite
    .prepare(
      `INSERT INTO internal_pull_requests
        (code, warehouse_part_id, finding_id, checksheet_id, machine_id, technician_user_id,
         part_name, sku, bin_location, quantity, item_label, category, note, created_at, is_seed)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      code,
      p.warehousePartId,
      p.findingId,
      p.checksheetId,
      p.machineId,
      p.technicianUserId,
      p.partName,
      p.sku,
      p.binLocation,
      p.quantity,
      p.itemLabel,
      p.category,
      p.note,
      p.createdAt,
      p.isSeed ? 1 : 0,
    )
  return code
}

const SELECT_PULL = `
  SELECT ipr.*,
         m.name AS machine, m.code AS machine_code,
         u.display_name AS technician,
         cs.code AS sheet,
         w.quantity_on_hand, w.needs_recount
  FROM internal_pull_requests ipr
  JOIN machines m ON m.id = ipr.machine_id
  JOIN users u ON u.id = ipr.technician_user_id
  JOIN checksheets cs ON cs.id = ipr.checksheet_id
  JOIN warehouse_parts w ON w.id = ipr.warehouse_part_id
`

export function listPullRequests(): PullRequestView[] {
  const rows = sqlite
    .prepare(
      `${SELECT_PULL}
       ORDER BY CASE ipr.status WHEN 'pending_pickup' THEN 0 WHEN 'discrepancy' THEN 1 ELSE 2 END,
                ipr.created_at DESC`,
    )
    .all() as Record<string, unknown>[]
  return camelizeRows<PullRequestView>(rows).map((r) => ({ ...r, needsRecount: Boolean(r.needsRecount) }))
}

export function getPullRequestByCode(code: string): PullRequestView | undefined {
  const row = sqlite.prepare(`${SELECT_PULL} WHERE ipr.code = ?`).get(code) as Record<string, unknown> | undefined
  if (!row) return undefined
  const r = camelizeRow<PullRequestView>(row)!
  return { ...r, needsRecount: Boolean(r.needsRecount) }
}

/**
 * Confirm collection: decrement stock and close the request, atomically.
 *
 * The decrement is clamped at zero and recorded in stock_movements. Wrapped in a
 * transaction so a request can never be marked collected without the matching stock
 * movement, or vice versa.
 */
export function confirmPickup(code: string, userId: number, now: string): PullRequestView | undefined {
  return inTransaction(() => {
    const pr = getPullRequestByCode(code)
    if (!pr || pr.status !== 'pending_pickup') return undefined

    const part = sqlite
      .prepare('SELECT quantity_on_hand FROM warehouse_parts WHERE id = ?')
      .get(pr.warehousePartId) as { quantity_on_hand: number } | undefined
    if (!part) return undefined

    const previous = part.quantity_on_hand
    const next = Math.max(0, previous - pr.quantity)

    sqlite
      .prepare('UPDATE warehouse_parts SET quantity_on_hand = ?, updated_at = ? WHERE id = ?')
      .run(next, now, pr.warehousePartId)
    sqlite
      .prepare(
        `INSERT INTO stock_movements
           (warehouse_part_id, pull_request_id, delta, previous_quantity, new_quantity, reason, moved_by_user_id, moved_at)
         VALUES (?, ?, ?, ?, ?, 'pickup', ?, ?)`,
      )
      .run(pr.warehousePartId, pr.id, next - previous, previous, next, userId, now)
    sqlite
      .prepare(
        `UPDATE internal_pull_requests
         SET status = 'picked_up', resolved_at = ?, resolved_by_user_id = ?
         WHERE id = ?`,
      )
      .run(now, userId, pr.id)

    return getPullRequestByCode(code)
  })
}

/**
 * "Not actually there." Flags the stock record for a recount instead of silently
 * decrementing a quantity we now know to be wrong.
 *
 * Deliberately does NOT guess the true count — an unknown quantity is worse than a
 * quantity marked untrustworthy, because only the second one prompts anyone to go look.
 */
export function reportDiscrepancy(
  code: string,
  userId: number,
  now: string,
  note: string | null,
): PullRequestView | undefined {
  return inTransaction(() => {
    const pr = getPullRequestByCode(code)
    if (!pr || pr.status !== 'pending_pickup') return undefined

    sqlite
      .prepare('UPDATE warehouse_parts SET needs_recount = 1, recount_note = ?, updated_at = ? WHERE id = ?')
      .run(note ?? `Reported missing against ${pr.code}`, now, pr.warehousePartId)
    sqlite
      .prepare(
        `UPDATE internal_pull_requests
         SET status = 'discrepancy', resolved_at = ?, resolved_by_user_id = ?, note = ?
         WHERE id = ?`,
      )
      .run(now, userId, note, pr.id)

    return getPullRequestByCode(code)
  })
}

export function countPendingPickups(): number {
  return (
    sqlite
      .prepare(`SELECT COUNT(*) AS n FROM internal_pull_requests WHERE status = 'pending_pickup'`)
      .get() as { n: number }
  ).n
}
