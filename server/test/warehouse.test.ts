import { beforeAll, describe, expect, it } from 'vitest'
import { sqlite } from '../src/db/client.js'
import { findAvailableStock, levelFor } from '../src/db/repo/warehouse.js'

/**
 * Scope rules for warehouse matching.
 *
 * The case that matters most here is the negative one: when the part for a failed
 * inspection point is out of stock, nothing else on that machine may be substituted for
 * it. Returning no match is the correct answer, because it is what hands the finding to
 * the vendor-drafting path.
 */

const part = (p: {
  sku: string
  name: string
  category: string
  machineId: number | null
  checklistItemId: number | null
  qty: number
}) =>
  sqlite
    .prepare(
      `INSERT INTO warehouse_parts
         (sku, part_name, category, machine_id, checklist_item_id,
          quantity_on_hand, reorder_threshold, max_quantity, bin_location)
       VALUES (?, ?, ?, ?, ?, ?, 2, 10, 'T1-01')`,
    )
    .run(p.sku, p.name, p.category, p.machineId, p.checklistItemId, p.qty)

const skuFor = (category: string, checklistItemId: number, quantity = 1) =>
  findAvailableStock({ category, machineId: 1, checklistItemId, quantity })?.sku

beforeAll(() => {
  // Machine 1 with checklist items 1 ("Test point A") and 2 ("Test point B") come from
  // test/setup.ts.
  part({ sku: 'W-POINT-A', name: 'Point A part', category: 'Damaged part', machineId: 1, checklistItemId: 1, qty: 5 })
  part({ sku: 'W-POINT-B', name: 'Point B part', category: 'Damaged part', machineId: 1, checklistItemId: 2, qty: 5 })
  part({ sku: 'W-MACHINE', name: 'Machine-wide part', category: 'Needs replacement', machineId: 1, checklistItemId: null, qty: 3 })
  part({ sku: 'W-GENERIC', name: 'General consumable', category: 'Needs lubrication', machineId: null, checklistItemId: null, qty: 9 })
})

describe('findAvailableStock — scope', () => {
  it('returns the part bound to the exact inspection point', () => {
    expect(skuFor('Damaged part', 1)).toBe('W-POINT-A')
    expect(skuFor('Damaged part', 2)).toBe('W-POINT-B')
  })

  it('does NOT substitute another point\'s part when the exact one is out of stock', () => {
    sqlite.prepare(`UPDATE warehouse_parts SET quantity_on_hand = 0 WHERE sku = 'W-POINT-A'`).run()

    // W-POINT-B is the same machine and the same category and has 5 on the shelf. It is
    // still the wrong component, so the correct result is no match at all.
    expect(skuFor('Damaged part', 1)).toBeUndefined()
    expect(skuFor('Damaged part', 2)).toBe('W-POINT-B')

    sqlite.prepare(`UPDATE warehouse_parts SET quantity_on_hand = 5 WHERE sku = 'W-POINT-A'`).run()
  })

  it('uses a machine-wide part (no inspection point) for any point on that machine', () => {
    expect(skuFor('Needs replacement', 1)).toBe('W-MACHINE')
    expect(skuFor('Needs replacement', 2)).toBe('W-MACHINE')
  })

  it('falls back to a general consumable when nothing is machine-specific', () => {
    expect(skuFor('Needs lubrication', 1)).toBe('W-GENERIC')
  })

  it('prefers the exact point over a machine-wide part in the same category', () => {
    part({
      sku: 'W-MACHINE-DMG',
      name: 'Machine-wide damaged part',
      category: 'Damaged part',
      machineId: 1,
      checklistItemId: null,
      qty: 7,
    })
    // try/finally so a failure here cannot leak W-MACHINE-DMG into later tests and turn
    // one real failure into a cascade of misleading ones.
    try {
      expect(skuFor('Damaged part', 1)).toBe('W-POINT-A')

      // ...and the machine-wide row is what remains once the exact part runs out.
      sqlite.prepare(`UPDATE warehouse_parts SET quantity_on_hand = 0 WHERE sku = 'W-POINT-A'`).run()
      expect(skuFor('Damaged part', 1)).toBe('W-MACHINE-DMG')
    } finally {
      sqlite.prepare(`UPDATE warehouse_parts SET quantity_on_hand = 5 WHERE sku = 'W-POINT-A'`).run()
      sqlite.prepare(`DELETE FROM warehouse_parts WHERE sku = 'W-MACHINE-DMG'`).run()
    }
  })

  it('returns nothing for a category the warehouse does not carry', () => {
    expect(skuFor('Leak detected', 1)).toBeUndefined()
  })

  it('ignores stock belonging to a different machine', () => {
    sqlite
      .prepare(
        `INSERT INTO machines (id, slug, name, code, area, pm_interval_label, last_pm_date, due_label, due_tone)
         VALUES (2, 'other-machine', 'Other Machine', 'MC-002', 'Test Area', 'Every 30 days', '2026-06-01', 'PM due today', 'primary')`,
      )
      .run()
    part({ sku: 'W-OTHER-MC', name: 'Other machine part', category: 'Misaligned', machineId: 2, checklistItemId: null, qty: 4 })

    expect(skuFor('Misaligned', 1)).toBeUndefined()
    expect(findAvailableStock({ category: 'Misaligned', machineId: 2, checklistItemId: 1 })?.sku).toBe('W-OTHER-MC')
  })
})

describe('findAvailableStock — reservations', () => {
  it('counts open pull requests against what a new request can claim', () => {
    sqlite
      .prepare(
        `INSERT INTO checksheets (id, code, machine_id, technician_user_id, work_order_code, status, submitted_at)
         VALUES (900, 'CS-900', 1, 2, 'WO-900', 'Pending Approval', '2026-08-11T00:00:00.000Z')`,
      )
      .run()
    const partId = (
      sqlite.prepare(`SELECT id FROM warehouse_parts WHERE sku = 'W-POINT-A'`).get() as { id: number }
    ).id

    // 5 on hand, 4 already promised to an uncollected pull request.
    sqlite
      .prepare(
        `INSERT INTO internal_pull_requests
           (code, warehouse_part_id, checksheet_id, machine_id, technician_user_id,
            part_name, sku, bin_location, quantity, status, created_at)
         VALUES ('IPR-900', ?, 900, 1, 2, 'Point A part', 'W-POINT-A', 'T1-01', 4, 'pending_pickup', '2026-08-11T00:00:00.000Z')`,
      )
      .run(partId)

    expect(skuFor('Damaged part', 1, 1)).toBe('W-POINT-A')
    expect(skuFor('Damaged part', 1, 2)).toBeUndefined()
  })
})

describe('levelFor', () => {
  it('reads the shelf count, not the available count', () => {
    expect(levelFor(0, 2)).toBe('out')
    expect(levelFor(2, 2)).toBe('low')
    expect(levelFor(3, 2)).toBe('healthy')
  })
})
