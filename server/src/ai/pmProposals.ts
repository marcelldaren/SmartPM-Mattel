import { callAiService } from './client.js'
import { getRecurringStats, getFindingHistory } from '../db/repo/findings.js'
import { getMachineById } from '../db/repo/machines.js'
import { getChatProvider } from '../db/repo/settings.js'
import { hasPendingRecommendation, insertPmRecommendation } from '../db/repo/pmRecommendations.js'
import { computeProposal } from '../pm/schedule.js'
import { stripHtml } from '../util/text.js'

/**
 * Turns the existing recurrence detection into concrete, approvable scheduling proposals.
 *
 * The detection and urgency ranking upstream of this are untouched — this is one extra
 * step after them. Within that step the split is the same as everywhere else in SmartPM:
 * Node computes every date and interval (src/pm/schedule.ts), the model only writes the
 * sentence a supervisor reads.
 *
 * If the AI service is unreachable the proposal is skipped entirely rather than created
 * with placeholder text. A schedule change a supervisor can't see a reason for is worse
 * than no proposal at all, and skipping guarantees nothing is ever auto-rescheduled.
 */

/** Only the highest-urgency recurrences (3+ failures) are worth proposing a change for. */
const MIN_OCCURRENCES_FOR_PROPOSAL = 3

export interface GenerateResult {
  created: number
  skipped: Array<{ machine: string; item: string; reason: string }>
}

export async function generatePmProposals(): Promise<GenerateResult> {
  const stats = getRecurringStats(MIN_OCCURRENCES_FOR_PROPOSAL)
  const now = new Date().toISOString()
  const result: GenerateResult = { created: 0, skipped: [] }

  for (const stat of stats) {
    const label = { machine: stat.machine, item: stat.itemLabel }

    if (hasPendingRecommendation(stat.machineId, stat.checklistItemId)) {
      result.skipped.push({ ...label, reason: 'a proposal for this point is already awaiting a decision' })
      continue
    }

    const machine = getMachineById(stat.machineId) as
      | { pmIntervalLabel: string; lastPmDate: string; nextPmDueDate: string | null }
      | undefined
    if (!machine) {
      result.skipped.push({ ...label, reason: 'machine not found' })
      continue
    }

    // --- Deterministic: dates and intervals, computed in Node ---
    const history = getFindingHistory(stat.machineId, stat.checklistItemId)
    const proposal = computeProposal({
      failureTimestamps: history.map((h) => h.createdAt),
      pmIntervalLabel: machine.pmIntervalLabel,
      lastPmDate: machine.lastPmDate,
      storedNextPmDueDate: machine.nextPmDueDate ?? null,
    })
    if (!proposal) {
      result.skipped.push({ ...label, reason: 'no date earlier than the current schedule is justified' })
      continue
    }

    // --- Model: the wording only. Every number below is already fixed. ---
    const prose = await callAiService<{ action: string; rationale: string }>('/recommend-pm', {
      provider: getChatProvider(),
      machineName: stat.machine,
      itemLabel: stat.itemLabel,
      category: stat.latestCategory,
      occurrences: stat.occurrences,
      avgGapDays: proposal.avgGapDays,
      currentIntervalDays: proposal.currentIntervalDays,
      suggestedIntervalDays: proposal.suggestedIntervalDays,
      currentDueDate: proposal.currentDueDate,
      suggestedDueDate: proposal.suggestedDueDate,
      daysEarlier: proposal.daysEarlier,
    })

    if (!prose?.action?.trim() || !prose?.rationale?.trim()) {
      // Fail open: no proposal this cycle. Detection still ran, nothing was rescheduled.
      result.skipped.push({ ...label, reason: 'AI service unavailable — no recommendation generated this cycle' })
      continue
    }

    insertPmRecommendation({
      machineId: stat.machineId,
      checklistItemId: stat.checklistItemId,
      itemLabel: stat.itemLabel,
      occurrences: stat.occurrences,
      avgGapDays: proposal.avgGapDays,
      currentIntervalDays: proposal.currentIntervalDays,
      suggestedIntervalDays: proposal.suggestedIntervalDays,
      currentDueDate: proposal.currentDueDate,
      suggestedDueDate: proposal.suggestedDueDate,
      daysEarlier: proposal.daysEarlier,
      basis: proposal.basis,
      action: stripHtml(prose.action.trim()),
      rationale: stripHtml(prose.rationale.trim()),
      createdAt: now,
    })
    result.created++
  }

  return result
}
