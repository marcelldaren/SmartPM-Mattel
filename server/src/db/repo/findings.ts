import { sqlite } from '../client.js'
import { formatDateLabel, relativeWhen } from '../util.js'

export function insertFinding(f: {
  checksheetId: number
  checklistItemId: number
  machineId: number
  title: string
  itemLabel: string
  category: string
  severity: 'High' | 'Medium' | 'Low'
  createdAt: string
}) {
  const result = sqlite
    .prepare(
      `INSERT INTO findings (checksheet_id, checklist_item_id, machine_id, title, item_label, category, severity, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(f.checksheetId, f.checklistItemId, f.machineId, f.title, f.itemLabel, f.category, f.severity, f.createdAt)
  return Number(result.lastInsertRowid)
}

export interface DashboardFinding {
  id: string
  title: string
  item: string
  machine: string
  sheet: string
  severity: string
  when: string
}

/** Shape matches the original SEED_FINDINGS mock exactly, so Dashboard.jsx needs no JSX changes. */
export function listRecentFindings(limit = 20): DashboardFinding[] {
  const rows = sqlite
    .prepare(
      `SELECT f.id, f.title, f.item_label, m.name AS machine, cs.code AS sheet, f.severity, f.created_at
       FROM findings f
       JOIN machines m ON m.id = f.machine_id
       JOIN checksheets cs ON cs.id = f.checksheet_id
       ORDER BY f.created_at DESC, f.id DESC
       LIMIT ?`,
    )
    .all(limit) as Record<string, unknown>[]

  return rows.map((r) => ({
    id: `F-${r.id}`,
    title: r.title as string,
    item: r.item_label as string,
    machine: r.machine as string,
    sheet: r.sheet as string,
    severity: r.severity as string,
    when: relativeWhen(r.created_at as string),
  }))
}

export interface FindingSearchDetail {
  sheet: string
  machine: string
  tech: string
  date: string
  finding: string
  status: string
}

/** Joined detail for one finding — used by AI Search to build result cards and to embed text for retrieval. */
export function getFindingSearchDetail(id: number): FindingSearchDetail | undefined {
  const row = sqlite
    .prepare(
      `SELECT cs.code AS sheet, m.name AS machine, u.display_name AS tech, cs.submitted_at AS submitted_at,
              f.title AS title, f.item_label AS item_label, cs.status AS status
       FROM findings f
       JOIN checksheets cs ON cs.id = f.checksheet_id
       JOIN machines m ON m.id = f.machine_id
       JOIN users u ON u.id = cs.technician_user_id
       WHERE f.id = ?`,
    )
    .get(id) as Record<string, unknown> | undefined
  if (!row) return undefined
  return {
    sheet: row.sheet as string,
    machine: row.machine as string,
    tech: row.tech as string,
    date: formatDateLabel(row.submitted_at as string),
    finding: `${row.title} — ${row.item_label}`,
    status: row.status as string,
  }
}

export interface RecurringStat {
  machineId: number
  checklistItemId: number
  machine: string
  machineCode: string
  itemLabel: string
  latestCategory: string
  pmIntervalLabel: string
  lastPmDate: string
  occurrences: number
  firstAt: string
  lastAt: string
}

/**
 * Deterministic recurrence signal for the predictive-PM agent: how many times each
 * inspection point has failed on each machine, over what span, vs. the machine's PM
 * interval. The ranking here is code, not the model — the LLM only narrates it.
 */
export function getRecurringStats(minOccurrences = 2): RecurringStat[] {
  const rows = sqlite
    .prepare(
      `SELECT f.machine_id, f.checklist_item_id, m.name AS machine, m.code AS machine_code,
              m.pm_interval_label, m.last_pm_date, ci.label AS item_label,
              COUNT(*) AS occurrences, MIN(f.created_at) AS first_at, MAX(f.created_at) AS last_at,
              (SELECT f2.category FROM findings f2
                 WHERE f2.machine_id = f.machine_id AND f2.checklist_item_id = f.checklist_item_id
                 ORDER BY f2.created_at DESC LIMIT 1) AS latest_category
       FROM findings f
       JOIN machines m ON m.id = f.machine_id
       JOIN checklist_items ci ON ci.id = f.checklist_item_id
       GROUP BY f.machine_id, f.checklist_item_id
       HAVING COUNT(*) >= ?
       ORDER BY occurrences DESC, last_at DESC`,
    )
    .all(minOccurrences) as Record<string, unknown>[]

  return rows.map((r) => ({
    machineId: r.machine_id as number,
    checklistItemId: r.checklist_item_id as number,
    machine: r.machine as string,
    machineCode: r.machine_code as string,
    itemLabel: r.item_label as string,
    latestCategory: r.latest_category as string,
    pmIntervalLabel: r.pm_interval_label as string,
    lastPmDate: r.last_pm_date as string,
    occurrences: r.occurrences as number,
    firstAt: r.first_at as string,
    lastAt: r.last_at as string,
  }))
}

export interface FindingHistoryEntry {
  sheet: string
  category: string
  createdAt: string
}

/** Real recurrence data for the same machine + inspection point — feeds the drafting agent's "Nth occurrence" reasoning. */
export function getFindingHistory(machineId: number, checklistItemId: number): FindingHistoryEntry[] {
  const rows = sqlite
    .prepare(
      `SELECT cs.code AS sheet, f.category, f.created_at
       FROM findings f
       JOIN checksheets cs ON cs.id = f.checksheet_id
       WHERE f.machine_id = ? AND f.checklist_item_id = ?
       ORDER BY f.created_at DESC`,
    )
    .all(machineId, checklistItemId) as Record<string, unknown>[]

  return rows.map((r) => ({
    sheet: r.sheet as string,
    category: r.category as string,
    createdAt: r.created_at as string,
  }))
}

export interface FindingTrendPoint {
  /** ISO date (YYYY-MM-DD), oldest first. */
  date: string
  total: number
  high: number
}

/**
 * Findings per day for the last `days` days, zero-filled.
 *
 * Zero-filling matters: without it a quiet Tuesday simply vanishes from the series and the
 * chart silently compresses time, making gaps look like activity. Computed here rather
 * than in the client because the client only ever receives relative labels ("2 days ago"),
 * not raw timestamps.
 */
export function getFindingTrend(days = 7): FindingTrendPoint[] {
  const rows = sqlite
    .prepare(
      `SELECT date(created_at) AS day,
              COUNT(*) AS total,
              SUM(CASE WHEN severity = 'High' THEN 1 ELSE 0 END) AS high
         FROM findings
        WHERE date(created_at) >= date('now', ?)
        GROUP BY date(created_at)`,
    )
    .all(`-${days - 1} days`) as { day: string; total: number; high: number }[]

  const byDay = new Map(rows.map((r) => [r.day, r]))
  const out: FindingTrendPoint[] = []
  const today = new Date()
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    const hit = byDay.get(key)
    out.push({ date: key, total: hit?.total ?? 0, high: hit?.high ?? 0 })
  }
  return out
}
