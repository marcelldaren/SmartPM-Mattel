import { callAiService } from './client.js'
import { getFindingHistory } from '../db/repo/findings.js'
import { getCatalogEntryForCategory } from '../db/repo/partCatalog.js'
import { getApprovalThresholdIdr, getChatProvider } from '../db/repo/settings.js'
import { stripHtml } from '../util/text.js'

export interface DraftInput {
  vendorName: string
  machineName: string
  findingTitle: string
  itemLabel: string
  checksheetCode: string
  category: string
  machineId: number
  checklistItemId: number
}

/** Advisory second-pass review of the drafted email. null = not reviewed, show no badge. */
export interface DraftReview {
  ok: boolean
  issues: string[]
  model: string | null
}

export interface DraftResult {
  costIdr: number
  partName: string
  status: 'auto' | 'pending'
  note: string | null
  subject: string
  body: string
  draftedBy: 'agent'
  review: DraftReview | null
}

/**
 * Part-request drafting.
 *
 * The correctness-critical work stays in Node: real recurrence history, catalog cost, and
 * the auto/pending decision are computed here deterministically from the database — never
 * delegated to the model. The Python AI service only turns those facts into a professional
 * vendor email. If the service is down or returns nothing usable, a deterministic template
 * fills in, so a submission can never be blocked by a flaky model.
 */
export async function draftPartRequest(input: DraftInput): Promise<DraftResult> {
  // --- Facts (deterministic, DB-backed) ---
  const history = getFindingHistory(input.machineId, input.checklistItemId)
  const occurrences = history.length
  const mostRecentSheet = history[0]?.sheet ?? null

  const entry = getCatalogEntryForCategory(input.category)
  const costIdr = entry?.typicalCostIdr ?? 1_000_000
  const partName = entry?.partName ?? `Replacement — ${input.itemLabel}`

  const thresholdIdr = getApprovalThresholdIdr()
  const status: 'auto' | 'pending' = costIdr < thresholdIdr ? 'auto' : 'pending'

  const note =
    occurrences > 0 ? `Flagged ${occurrences + 1}× — most recently ${mostRecentSheet}` : null

  const neededBy = new Date(Date.now() + 5 * 24 * 3600 * 1000).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })

  // --- Prose (model, via Python AI service) ---
  const drafted = await callAiService<{ subject: string; body: string }>('/draft', {
    provider: getChatProvider(),
    vendorName: input.vendorName,
    machineName: input.machineName,
    findingTitle: input.findingTitle,
    itemLabel: input.itemLabel,
    checksheetCode: input.checksheetCode,
    category: input.category,
    partName,
    costIdr,
    thresholdIdr,
    status,
    recurrenceNote: note,
    neededBy,
  })

  const usedModelDraft = Boolean(drafted && drafted.subject && drafted.body)
  const email = usedModelDraft
    ? { subject: drafted!.subject, body: drafted!.body }
    : {
        subject: `Part Request — ${partName}, ${input.machineName}`,
        body: `Dear ${input.vendorName},\n\nDuring preventive maintenance on ${input.machineName} (checksheet ${input.checksheetCode}), the inspection point "${input.itemLabel}" was found with: ${input.findingTitle}.${note ? ` ${note}.` : ''}\n\nRequested part: ${partName}\nEstimated cost: Rp ${costIdr.toLocaleString('id-ID')}\nNeeded by: ${neededBy}\n\nPlease confirm availability and lead time.\n\n— SmartPM automated request • PT Mattel Indonesia (PTMI)`,
      }

  const subject = stripHtml(email.subject)
  const body = stripHtml(email.body)

  // --- Self-review (second model call, advisory only) ---
  // Skipped for the deterministic fallback: Node built that text from the same facts the
  // reviewer would check it against, so it cannot disagree — reviewing it would just be a
  // paid call with a foregone conclusion.
  const review = usedModelDraft
    ? await reviewDraft({
        subject,
        body,
        vendorName: input.vendorName,
        machineName: input.machineName,
        findingTitle: input.findingTitle,
        itemLabel: input.itemLabel,
        checksheetCode: input.checksheetCode,
        partName,
        costIdr,
      })
    : null

  return {
    costIdr,
    partName,
    status, // unchanged by the review — routing stays deterministic, decided above
    note,
    subject,
    body,
    draftedBy: 'agent',
    review,
  }
}

interface ReviewInput {
  subject: string
  body: string
  vendorName: string
  machineName: string
  findingTitle: string
  itemLabel: string
  checksheetCode: string
  partName: string
  costIdr: number
}

/**
 * Ask a second, independent model call to grade the drafted email against the facts Node
 * already computed. The authoritative cost is passed in so the reviewer only checks that
 * the drafted *text* states that same number — it never recomputes or re-decides anything.
 *
 * Returns null on any failure (service down, timeout, malformed reply). Callers store null
 * and render no badge: an unavailable review must never be displayed as a failed review,
 * and must never influence whether an email sends.
 */
export async function reviewDraft(input: ReviewInput): Promise<DraftReview | null> {
  const res = await callAiService<{
    reviewed_ok: boolean
    issues: string[]
    model: string | null
  }>('/draft/review', { provider: getChatProvider(), ...input })

  if (!res || typeof res.reviewed_ok !== 'boolean') return null

  const issues = Array.isArray(res.issues)
    ? res.issues.map((i) => String(i).trim()).filter(Boolean).slice(0, 6)
    : []
  return { ok: res.reviewed_ok && issues.length === 0, issues, model: res.model ?? null }
}
