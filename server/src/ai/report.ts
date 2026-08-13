import { callAiService } from './client.js'
import { getReportData, type ReportData } from '../db/repo/reports.js'
import { getRecurringStats } from '../db/repo/findings.js'
import { getChatProvider } from '../db/repo/settings.js'
import { fmtIdr } from '../db/util.js'
import { stripHtml } from '../util/text.js'

export interface ReportResponse {
  generatedAt: string
  data: ReportData & { recurringCount: number }
  topRecurring: Array<{ machine: string; item: string; occurrences: number }>
  headline: string
  summary: string
  highlights: string[]
  recommendation: string
}

/**
 * AI end-of-shift PM report. Node aggregates the shift's real numbers deterministically;
 * the model turns them into an executive narrative (headline, summary, highlights,
 * recommendation). A deterministic template covers any model failure so the report is
 * always produced.
 */
export async function generateReport(): Promise<ReportResponse> {
  const data = getReportData()
  const recurring = getRecurringStats(2)
  const topRecurring = recurring.slice(0, 5).map((s) => ({
    machine: s.machine,
    item: s.itemLabel,
    occurrences: s.occurrences,
  }))
  const generatedAt = new Date().toISOString()
  const fullData = { ...data, recurringCount: recurring.length }

  const ai = await callAiService<{
    headline: string
    summary: string
    highlights: string[]
    recommendation: string
  }>('/report', {
    provider: getChatProvider(),
    data: fullData,
    topRecurring,
  })

  const fallbackHighlights = [
    `${data.checksheetsToday} checksheet${data.checksheetsToday === 1 ? '' : 's'} submitted today (${data.complete} complete, ${data.flagged} flagged, ${data.pendingApproval} pending approval).`,
    `${data.pendingRequests} part request${data.pendingRequests === 1 ? '' : 's'} awaiting approval, worth ${fmtIdr(data.pendingCostIdr)}.`,
    `${recurring.length} inspection point${recurring.length === 1 ? '' : 's'} failing repeatedly across the plant.`,
  ]

  // Use `||` (not `??`) so the AI service's empty-string fallback signal triggers Node's template.
  return {
    generatedAt,
    data: fullData,
    topRecurring,
    headline: stripHtml(ai?.headline || 'Daily Preventive-Maintenance Report'),
    summary: stripHtml(
      ai?.summary ||
        `Across the plant, ${data.totalFindings} finding${data.totalFindings === 1 ? '' : 's'} are on record with ${data.highSeverity} at high severity. ${data.pendingRequests} part request${data.pendingRequests === 1 ? '' : 's'} (${fmtIdr(data.pendingCostIdr)}) await supervisor approval.`,
    ),
    highlights: (ai?.highlights?.length ? ai.highlights : fallbackHighlights).map(stripHtml),
    recommendation: stripHtml(
      ai?.recommendation ||
        (recurring.length > 0
          ? `Prioritize ${recurring[0].machine} — "${recurring[0].itemLabel}" has recurred ${recurring[0].occurrences}×.`
          : 'No recurring failures — maintain the current PM schedule.'),
    ),
  }
}
