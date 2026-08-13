import { sqlite } from '../client.js'

export interface ReportData {
  checksheetsToday: number
  complete: number
  flagged: number
  pendingApproval: number
  totalFindings: number
  highSeverity: number
  mediumSeverity: number
  pendingRequests: number
  pendingCostIdr: number
}

const count = (sql: string, ...params: unknown[]): number =>
  (sqlite.prepare(sql).get(...(params as never[])) as { n: number }).n

/**
 * Deterministic aggregate for the AI shift report. All numbers are computed here in SQL;
 * the model only narrates them. "Today" uses SQLite's date() over the ISO submitted_at.
 */
export function getReportData(): ReportData {
  const statusToday = (status: string) =>
    count(`SELECT COUNT(*) AS n FROM checksheets WHERE date(submitted_at) = date('now') AND status = ?`, status)

  return {
    checksheetsToday: count(`SELECT COUNT(*) AS n FROM checksheets WHERE date(submitted_at) = date('now')`),
    complete: statusToday('Complete'),
    flagged: statusToday('Flagged'),
    pendingApproval: statusToday('Pending Approval'),
    totalFindings: count('SELECT COUNT(*) AS n FROM findings'),
    highSeverity: count(`SELECT COUNT(*) AS n FROM findings WHERE severity = 'High'`),
    mediumSeverity: count(`SELECT COUNT(*) AS n FROM findings WHERE severity = 'Medium'`),
    pendingRequests: count(`SELECT COUNT(*) AS n FROM part_requests WHERE status = 'pending'`),
    pendingCostIdr:
      (
        sqlite
          .prepare(`SELECT COALESCE(SUM(cost_idr), 0) AS n FROM part_requests WHERE status = 'pending'`)
          .get() as { n: number }
      ).n,
  }
}
