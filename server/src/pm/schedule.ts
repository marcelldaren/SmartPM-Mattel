/**
 * Deterministic PM-rescheduling arithmetic.
 *
 * Every date and interval in a recommendation is computed here, in Node, from the stored
 * finding history. The model is never asked to pick or adjust a date — it only writes
 * prose around numbers this module already fixed. That keeps a wrong or hallucinated date
 * structurally impossible rather than merely unlikely.
 *
 * Pure functions, no database access, so the heuristic is directly testable.
 */

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Schedule PM at this fraction of the observed mean time between failures. Below 1.0 so
 * maintenance lands *before* the point typically fails again; 0.8 leaves a 20% margin.
 */
export const SAFETY_FACTOR = 0.8

/** Never propose a PM cycle tighter than this, however often the point fails. */
export const MIN_INTERVAL_DAYS = 7

/**
 * All PM dates are calendar dates, not instants, so they are handled in local time
 * throughout. `toISOString()` is deliberately NOT used: it converts local midnight to
 * UTC, which in any timezone ahead of UTC (WIB is UTC+7) rolls the date back a day and
 * shifts every schedule by one.
 *
 * Date-only values are anchored at local noon so a DST shift of an hour either way can
 * never cross a day boundary.
 */
function parseLocalDate(value: string | Date): Date | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime())
      ? null
      : new Date(value.getFullYear(), value.getMonth(), value.getDate(), 12)
  }
  const isoOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim())
  if (isoOnly) {
    return new Date(Number(isoOnly[1]), Number(isoOnly[2]) - 1, Number(isoOnly[3]), 12)
  }
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return null
  return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate(), 12)
}

export function toIsoDate(d: Date): string {
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${month}-${day}`
}

export function addDays(value: string | Date, days: number): string {
  const base = parseLocalDate(value)
  if (!base) throw new Error(`addDays: unparseable date ${String(value)}`)
  return toIsoDate(new Date(base.getTime() + days * DAY_MS))
}

export function daysBetween(fromIso: string, toIso: string): number {
  const from = parseLocalDate(fromIso)
  const to = parseLocalDate(toIso)
  if (!from || !to) return 0
  return Math.round((to.getTime() - from.getTime()) / DAY_MS)
}

/** "Every 30 days" -> 30. Returns null when the label isn't a plain day count. */
export function parseIntervalDays(label: string): number | null {
  const m = /(\d+)\s*day/i.exec(label ?? '')
  if (!m) return null
  const n = Number(m[1])
  return Number.isFinite(n) && n > 0 ? n : null
}

/** Seeded dates are human strings ("Jun 19, 2026"); normalise to a local ISO date. */
export function parseStoredDate(value: string): string | null {
  if (!value) return null
  const parsed = parseLocalDate(value)
  return parsed ? toIsoDate(parsed) : null
}

/** Mean days between consecutive failures. Needs 2+ timestamps to have any gap at all. */
export function averageGapDays(timestampsIso: string[]): number | null {
  const sorted = [...timestampsIso]
    .map((t) => new Date(t).getTime())
    .filter((t) => Number.isFinite(t))
    .sort((a, b) => a - b)
  if (sorted.length < 2) return null

  let total = 0
  for (let i = 1; i < sorted.length; i++) total += sorted[i] - sorted[i - 1]
  const avg = total / (sorted.length - 1) / DAY_MS
  return avg > 0 ? avg : null
}

export interface ProposalInput {
  failureTimestamps: string[]
  /** Machine's current PM cadence, e.g. "Every 30 days". */
  pmIntervalLabel: string
  /** Machine's last completed PM, as stored. */
  lastPmDate: string
  /** Stored next_pm_due_date if a supervisor has already set one. */
  storedNextPmDueDate: string | null
  /** Today, injected so the calculation is testable and reproducible. */
  today?: Date
}

export interface Proposal {
  avgGapDays: number
  currentIntervalDays: number
  suggestedIntervalDays: number
  currentDueDate: string
  suggestedDueDate: string
  daysEarlier: number
  /** Node's own arithmetic in plain language — shown to the supervisor as-is. */
  basis: string
}

/**
 * Propose an earlier next-PM date, or null when there is no defensible case for one.
 *
 * The rule: if a point fails on average every N days but PM only runs every M days, PM is
 * arriving too late to catch it. Move the next PM to SAFETY_FACTOR x N after the last PM.
 *
 * Returns null (no proposal) when the history is too thin to average, the interval label
 * can't be parsed, the dates are unusable, or the result would not actually be earlier
 * than what's already scheduled — proposing a same-or-later date is not an improvement.
 */
export function computeProposal(input: ProposalInput): Proposal | null {
  const avgGapDays = averageGapDays(input.failureTimestamps)
  if (avgGapDays === null) return null

  const currentIntervalDays = parseIntervalDays(input.pmIntervalLabel)
  if (currentIntervalDays === null) return null

  const lastPm = parseStoredDate(input.lastPmDate)
  if (!lastPm) return null

  // A tighter cycle than the failures warrant is just wasted labour, so cap at the
  // current interval; the floor stops a burst of failures proposing a 2-day cycle.
  const suggestedIntervalDays = Math.max(
    MIN_INTERVAL_DAYS,
    Math.min(currentIntervalDays, Math.round(avgGapDays * SAFETY_FACTOR)),
  )

  const currentDueDate =
    parseStoredDate(input.storedNextPmDueDate ?? '') ?? addDays(lastPm, currentIntervalDays)
  const suggestedDueDate = addDays(lastPm, suggestedIntervalDays)

  const daysEarlier = daysBetween(suggestedDueDate, currentDueDate)
  if (daysEarlier < 1) return null

  const basis =
    `This point has failed on average every ${avgGapDays.toFixed(1)} days, but PM runs every ` +
    `${currentIntervalDays} days — so maintenance arrives after the failure has already happened. ` +
    `Scheduling at ${Math.round(SAFETY_FACTOR * 100)}% of the observed failure interval gives a ` +
    `${suggestedIntervalDays}-day cycle, moving the next PM from ${currentDueDate} to ` +
    `${suggestedDueDate} (${daysEarlier} day${daysEarlier === 1 ? '' : 's'} earlier).`

  return {
    avgGapDays,
    currentIntervalDays,
    suggestedIntervalDays,
    currentDueDate,
    suggestedDueDate,
    daysEarlier,
    basis,
  }
}
