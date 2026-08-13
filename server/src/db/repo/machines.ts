import { sqlite } from '../client.js'
import { camelizeRow, camelizeRows, parseDueLabel, relativeWhen } from '../util.js'

export interface ChecklistItemRow {
  id: number
  label: string
  hint: string
}

export interface MachineRow {
  id: number
  slug: string
  name: string
  code: string
  area: string
  pmIntervalLabel: string
  lastPmDate: string
  dueLabel: string
  dueTone: 'primary' | 'accent' | 'neutral'
  /** Translatable form of dueLabel — see parseDueLabel. */
  due: ReturnType<typeof parseDueLabel>
  checklist: ChecklistItemRow[]
}

export function listMachines(): MachineRow[] {
  const machines = camelizeRows<Omit<MachineRow, 'checklist'>>(
    sqlite.prepare('SELECT * FROM machines ORDER BY id').all() as Record<string, unknown>[],
  )
  const items = camelizeRows<{ id: number; machineId: number; label: string; hint: string }>(
    sqlite.prepare('SELECT id, machine_id, label, hint FROM checklist_items ORDER BY machine_id, sort_order').all() as Record<
      string,
      unknown
    >[],
  )
  return machines.map((m) => ({
    ...m,
    due: parseDueLabel(m.dueLabel),
    checklist: items.filter((i) => i.machineId === m.id).map(({ id, label, hint }) => ({ id, label, hint })),
  }))
}

export function getMachineById(id: number) {
  return camelizeRow(sqlite.prepare('SELECT * FROM machines WHERE id = ?').get(id) as Record<string, unknown> | undefined)
}

export function getChecklistItem(id: number) {
  return camelizeRow(
    sqlite.prepare('SELECT * FROM checklist_items WHERE id = ?').get(id) as Record<string, unknown> | undefined,
  )
}

export interface MachineStatus {
  machine: string
  code: string
  area: string
  pmIntervalLabel: string
  lastPmDate: string
  dueLabel: string
  openFindings: number
  pendingPartRequests: number
  recentFindings: Array<{ finding: string; item: string; severity: string; sheet: string; when: string }>
}

/**
 * Machine health snapshot used by the assistant's `get_machine_status` tool. Matches a
 * machine by name or code (case-insensitive, partial), returns undefined if none found.
 */
export function getMachineStatus(query: string): MachineStatus | undefined {
  const like = `%${query.trim()}%`
  const m = sqlite
    .prepare(
      `SELECT * FROM machines WHERE name LIKE ? COLLATE NOCASE OR code LIKE ? COLLATE NOCASE
       ORDER BY id LIMIT 1`,
    )
    .get(like, like) as Record<string, unknown> | undefined
  if (!m) return undefined
  const machineId = m.id as number

  const openFindings = (
    sqlite.prepare('SELECT COUNT(*) AS n FROM findings WHERE machine_id = ?').get(machineId) as { n: number }
  ).n
  const pendingPartRequests = (
    sqlite
      .prepare(`SELECT COUNT(*) AS n FROM part_requests WHERE machine_id = ? AND status = 'pending'`)
      .get(machineId) as { n: number }
  ).n

  const recent = sqlite
    .prepare(
      `SELECT f.title AS finding, f.item_label AS item, f.severity, cs.code AS sheet, f.created_at
       FROM findings f JOIN checksheets cs ON cs.id = f.checksheet_id
       WHERE f.machine_id = ? ORDER BY f.created_at DESC LIMIT 5`,
    )
    .all(machineId) as Record<string, unknown>[]

  return {
    machine: m.name as string,
    code: m.code as string,
    area: m.area as string,
    pmIntervalLabel: m.pm_interval_label as string,
    lastPmDate: m.last_pm_date as string,
    dueLabel: m.due_label as string,
    openFindings,
    pendingPartRequests,
    recentFindings: recent.map((r) => ({
      finding: r.finding as string,
      item: r.item as string,
      severity: r.severity as string,
      sheet: r.sheet as string,
      when: relativeWhen(r.created_at as string),
    })),
  }
}
