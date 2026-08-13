import { sqlite } from '../client.js'
import { formatDateLabel } from '../util.js'

export function nextChecksheetCode(): string {
  const rows = sqlite.prepare('SELECT code FROM checksheets').all() as { code: string }[]
  const maxNum = rows.reduce((max, r) => Math.max(max, Number(r.code.replace('CS-', ''))), 2048)
  return `CS-${maxNum + 1}`
}

export function insertChecksheet(c: {
  code: string
  machineId: number
  technicianUserId: number
  workOrderCode: string
  status: 'Complete' | 'Flagged' | 'Pending Approval'
  submittedAt: string
  isSeed: boolean
}) {
  const result = sqlite
    .prepare(
      `INSERT INTO checksheets (code, machine_id, technician_user_id, work_order_code, status, submitted_at, is_seed)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(c.code, c.machineId, c.technicianUserId, c.workOrderCode, c.status, c.submittedAt, c.isSeed ? 1 : 0)
  return Number(result.lastInsertRowid)
}

export function insertChecksheetAnswer(a: {
  checksheetId: number
  checklistItemId: number
  result: 'pass' | 'fail'
  category: string | null
}) {
  sqlite
    .prepare(
      'INSERT INTO checksheet_answers (checksheet_id, checklist_item_id, result, category) VALUES (?, ?, ?, ?)',
    )
    .run(a.checksheetId, a.checklistItemId, a.result, a.category)
}

export interface DashboardSheet {
  id: string
  machine: string
  tech: string
  vendor: string
  date: string
  findings: number
  status: string
  generated: boolean
}

/** Shape matches the original SEED_SHEETS mock exactly, so Dashboard.jsx needs no JSX changes. */
export function listSheetsForDashboard(limit = 50): DashboardSheet[] {
  const rows = sqlite
    .prepare(
      `SELECT
         cs.code AS id,
         m.name AS machine,
         u.display_name AS tech,
         v.name AS vendor,
         cs.submitted_at AS submitted_at,
         cs.status AS status,
         cs.is_seed AS is_seed,
         (SELECT COUNT(*) FROM findings f WHERE f.checksheet_id = cs.id) AS findings
       FROM checksheets cs
       JOIN machines m ON m.id = cs.machine_id
       JOIN users u ON u.id = cs.technician_user_id
       LEFT JOIN vendors v ON v.id = u.vendor_id
       ORDER BY cs.submitted_at DESC, cs.id DESC
       LIMIT ?`,
    )
    .all(limit) as Record<string, unknown>[]

  return rows.map((r) => ({
    id: r.id as string,
    machine: r.machine as string,
    tech: r.tech as string,
    vendor: (r.vendor as string) ?? '',
    date: formatDateLabel(r.submitted_at as string),
    findings: r.findings as number,
    status: r.status as string,
    generated: !r.is_seed,
  }))
}

export function getChecksheetIdByCode(code: string): number | undefined {
  const row = sqlite.prepare('SELECT id FROM checksheets WHERE code = ?').get(code) as { id: number } | undefined
  return row?.id
}
