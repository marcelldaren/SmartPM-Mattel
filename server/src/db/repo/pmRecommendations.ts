import { sqlite } from '../client.js'
import { camelizeRows } from '../util.js'

/**
 * Persistence for predictive-PM scheduling proposals and the schedule changes they cause.
 *
 * Approving a proposal is the only path that writes machines.next_pm_due_date, and it
 * always writes an audit row alongside it — a schedule change with no trace of who made
 * it or why is not acceptable in a maintenance record.
 */

export interface PmRecommendationRow {
  id: number
  machineId: number
  machine: string
  machineCode: string
  itemLabel: string
  occurrences: number
  avgGapDays: number
  currentIntervalDays: number
  suggestedIntervalDays: number
  currentDueDate: string
  suggestedDueDate: string
  daysEarlier: number
  basis: string
  action: string
  rationale: string
  status: 'pending' | 'approved' | 'dismissed'
  createdAt: string
  decidedAt: string | null
}

const SELECT = `
  SELECT r.id, r.machine_id, m.name AS machine, m.code AS machine_code, r.item_label,
         r.occurrences, r.avg_gap_days, r.current_interval_days, r.suggested_interval_days,
         r.current_due_date, r.suggested_due_date, r.days_earlier, r.basis, r.action,
         r.rationale, r.status, r.created_at, r.decided_at
    FROM pm_recommendations r
    JOIN machines m ON m.id = r.machine_id`

export function listPmRecommendations(): PmRecommendationRow[] {
  return camelizeRows<PmRecommendationRow>(
    sqlite
      .prepare(
        `${SELECT}
          ORDER BY CASE r.status WHEN 'pending' THEN 0 ELSE 1 END,
                   r.days_earlier DESC, r.id DESC`,
      )
      .all() as Record<string, unknown>[],
  )
}

export function getPmRecommendation(id: number): PmRecommendationRow | undefined {
  return camelizeRows<PmRecommendationRow>(
    sqlite.prepare(`${SELECT} WHERE r.id = ?`).all(id) as Record<string, unknown>[],
  )[0]
}

export function hasPendingRecommendation(machineId: number, checklistItemId: number): boolean {
  const row = sqlite
    .prepare(
      `SELECT 1 FROM pm_recommendations
        WHERE machine_id = ? AND checklist_item_id = ? AND status = 'pending' LIMIT 1`,
    )
    .get(machineId, checklistItemId)
  return Boolean(row)
}

export function insertPmRecommendation(r: {
  machineId: number
  checklistItemId: number
  itemLabel: string
  occurrences: number
  avgGapDays: number
  currentIntervalDays: number
  suggestedIntervalDays: number
  currentDueDate: string
  suggestedDueDate: string
  daysEarlier: number
  basis: string
  action: string
  rationale: string
  createdAt: string
}): number {
  const result = sqlite
    .prepare(
      `INSERT INTO pm_recommendations
         (machine_id, checklist_item_id, item_label, occurrences, avg_gap_days,
          current_interval_days, suggested_interval_days, current_due_date,
          suggested_due_date, days_earlier, basis, action, rationale, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
    )
    .run(
      r.machineId,
      r.checklistItemId,
      r.itemLabel,
      r.occurrences,
      r.avgGapDays,
      r.currentIntervalDays,
      r.suggestedIntervalDays,
      r.currentDueDate,
      r.suggestedDueDate,
      r.daysEarlier,
      r.basis,
      r.action,
      r.rationale,
      r.createdAt,
    )
  return Number(result.lastInsertRowid)
}

/**
 * Approve: move the machine's next PM date and record the change. Done in one transaction
 * so the schedule can never move without its audit row, or vice versa.
 */
export function approvePmRecommendation(id: number, userId: number): PmRecommendationRow | null {
  const rec = getPmRecommendation(id)
  if (!rec || rec.status !== 'pending') return null

  const now = new Date().toISOString()
  const previous = (
    sqlite.prepare('SELECT next_pm_due_date FROM machines WHERE id = ?').get(rec.machineId) as
      | { next_pm_due_date: string | null }
      | undefined
  )?.next_pm_due_date ?? null

  sqlite.exec('BEGIN')
  try {
    sqlite
      .prepare('UPDATE machines SET next_pm_due_date = ? WHERE id = ?')
      .run(rec.suggestedDueDate, rec.machineId)
    sqlite
      .prepare(
        `INSERT INTO pm_schedule_changes
           (machine_id, recommendation_id, previous_due_date, new_due_date, changed_by_user_id, changed_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(rec.machineId, rec.id, previous ?? rec.currentDueDate, rec.suggestedDueDate, userId, now)
    sqlite
      .prepare(`UPDATE pm_recommendations SET status = 'approved', decided_at = ?, decided_by_user_id = ? WHERE id = ?`)
      .run(now, userId, id)
    sqlite.exec('COMMIT')
  } catch (err) {
    sqlite.exec('ROLLBACK')
    throw err
  }

  return getPmRecommendation(id) ?? null
}

/** Dismiss: status change only, deliberately no side effect on the schedule. */
export function dismissPmRecommendation(id: number, userId: number): PmRecommendationRow | null {
  const rec = getPmRecommendation(id)
  if (!rec || rec.status !== 'pending') return null
  sqlite
    .prepare(`UPDATE pm_recommendations SET status = 'dismissed', decided_at = ?, decided_by_user_id = ? WHERE id = ?`)
    .run(new Date().toISOString(), userId, id)
  return getPmRecommendation(id) ?? null
}

export interface ScheduleChangeRow {
  id: number
  machine: string
  previousDueDate: string | null
  newDueDate: string
  changedBy: string | null
  changedAt: string
}

export function listScheduleChanges(limit = 20): ScheduleChangeRow[] {
  return camelizeRows<ScheduleChangeRow>(
    sqlite
      .prepare(
        `SELECT c.id, m.name AS machine, c.previous_due_date, c.new_due_date,
                u.display_name AS changed_by, c.changed_at
           FROM pm_schedule_changes c
           JOIN machines m ON m.id = c.machine_id
           LEFT JOIN users u ON u.id = c.changed_by_user_id
          ORDER BY c.id DESC LIMIT ?`,
      )
      .all(limit) as Record<string, unknown>[],
  )
}
