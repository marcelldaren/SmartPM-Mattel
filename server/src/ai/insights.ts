import { callAiService } from './client.js'
import { getRecurringStats } from '../db/repo/findings.js'
import { getChatProvider } from '../db/repo/settings.js'
import { relativeWhen } from '../db/util.js'
import { stripHtml } from '../util/text.js'

export interface InsightStat {
  machine: string
  machineCode: string
  item: string
  category: string
  occurrences: number
  firstAt: string
  lastAt: string
  lastSeen: string
  pmIntervalLabel: string
  lastPmDate: string
  urgency: 'High' | 'Medium'
}

export interface Recommendation {
  machine: string
  item: string
  action: string
  rationale: string
  urgency: 'High' | 'Medium'
}

export interface InsightsResponse {
  generatedAt: string
  summary: string
  stats: InsightStat[]
  recommendations: Recommendation[]
}

const urgencyFor = (occurrences: number): 'High' | 'Medium' => (occurrences >= 3 ? 'High' : 'Medium')

/**
 * Predictive-PM agent. The recurrence detection and urgency ranking are deterministic
 * (getRecurringStats + urgencyFor) — the model never decides what's trending. It only
 * writes the summary and per-item rationale/action. If the AI service is down, a
 * deterministic template fills those in, so the insight is always available.
 */
export async function getPredictivePmInsights(): Promise<InsightsResponse> {
  const raw = getRecurringStats(2)
  const generatedAt = new Date().toISOString()

  const stats: InsightStat[] = raw.map((s) => ({
    machine: s.machine,
    machineCode: s.machineCode,
    item: s.itemLabel,
    category: s.latestCategory,
    occurrences: s.occurrences,
    firstAt: s.firstAt,
    lastAt: s.lastAt,
    lastSeen: relativeWhen(s.lastAt),
    pmIntervalLabel: s.pmIntervalLabel,
    lastPmDate: s.lastPmDate,
    urgency: urgencyFor(s.occurrences),
  }))

  if (stats.length === 0) {
    return {
      generatedAt,
      summary: 'No recurring inspection failures yet — nothing is trending toward a predictive-maintenance action.',
      stats: [],
      recommendations: [],
    }
  }

  const analysis = await callAiService<{
    summary: string
    recommendations: Array<{ machine: string; item: string; action: string; rationale: string }>
  }>('/analyze-trends', {
    provider: getChatProvider(),
    stats: raw.map((s) => ({
      machine: s.machine,
      item: s.itemLabel,
      category: s.latestCategory,
      occurrences: s.occurrences,
      lastSeen: relativeWhen(s.lastAt),
      pmInterval: s.pmIntervalLabel,
    })),
  })

  const summary =
    analysis?.summary ??
    `${stats.length} inspection point${stats.length > 1 ? 's are' : ' is'} failing repeatedly and may warrant bringing preventive maintenance forward.`

  const recByKey = new Map<string, { action: string; rationale: string }>()
  for (const r of analysis?.recommendations ?? []) {
    recByKey.set(`${r.machine}||${r.item}`, { action: r.action, rationale: r.rationale })
  }

  const recommendations: Recommendation[] = stats.map((s) => {
    const r = recByKey.get(`${s.machine}||${s.item}`)
    return {
      machine: s.machine,
      item: s.item,
      urgency: s.urgency,
      action: stripHtml(r?.action ?? `Bring forward PM on ${s.machine} focused on "${s.item}".`),
      rationale: stripHtml(
        r?.rationale ??
          `Failed ${s.occurrences}× (last ${s.lastSeen}) — recurring inside the ${s.pmIntervalLabel.toLowerCase()} PM window.`,
      ),
    }
  })

  return { generatedAt, summary: stripHtml(summary), stats, recommendations }
}
