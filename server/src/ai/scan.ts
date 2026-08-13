import { callAiService } from './client.js'
import { getChatProvider } from '../db/repo/settings.js'
import { listMachines } from '../db/repo/machines.js'
import { listTechnicians } from '../db/repo/users.js'

/**
 * Paper-checksheet scanning: photo in, a *draft* for the digital form out.
 *
 * This module deliberately produces nothing but a pre-fill. It writes no checksheet, no
 * finding and no part request; the technician reviews the draft and submits through the
 * existing POST /api/checksheets path, which re-validates everything from scratch. A scan
 * that reads a row wrong is therefore a mild annoyance, never a bad database record.
 *
 * The other half of that safety is here rather than in the prompt: every string the model
 * returns is matched against the real catalogue and dropped if it does not correspond to
 * a row that actually exists. Prompting a model not to invent things reduces invention;
 * it does not prevent it. Validating against the database does.
 */

// Kept in step with PART_REQUEST_CATEGORIES / FINDING_CATEGORIES on both other sides —
// src/data.js for the client, routes/checksheets.ts for submission.
const FINDING_CATEGORIES = [
  'Damaged part',
  'Needs replacement',
  'Needs lubrication',
  'Misaligned',
  'Leak detected',
  'Abnormal noise / vibration',
]

type Confidence = 'high' | 'low'

interface ScanPointOut {
  label: string
  result: 'pass' | 'fail' | 'blank'
  resultConfidence: Confidence
  category: string | null
  categoryConfidence: Confidence
  photoAttached: 'yes' | 'no' | 'blank'
}

interface ScanServiceResponse {
  supported: boolean
  ok: boolean
  reason?: string | null
  note?: string | null
  extraction?: {
    technicianName?: string | null
    technicianConfidence?: Confidence
    date?: string | null
    dateConfidence?: Confidence
    machine?: string | null
    machineConfidence?: Confidence
    points?: ScanPointOut[]
  } | null
  blur?: number | null
  blurThreshold?: number | null
  deskewed?: boolean | null
  width?: number | null
  height?: number | null
  model?: string | null
}

/** One checklist row, resolved to a real checklist_items.id. */
export interface PrefillAnswer {
  checklistItemId: number
  label: string
  result: 'pass' | 'fail' | null
  category: string | null
  /** Drives the amber "look here" outline in the form. */
  lowConfidenceResult: boolean
  lowConfidenceCategory: boolean
  photoAttached: boolean
}

export interface ScanPrefill {
  machineId: number | null
  machineName: string | null
  machineLowConfidence: boolean
  technicianUserId: number | null
  technicianName: string | null
  technicianLowConfidence: boolean
  /** Read off the paper. Informational only — the digital form has no date field. */
  paperDate: string | null
  answers: PrefillAnswer[]
  /** Human-readable notes about anything dropped or unresolved. */
  warnings: string[]
  model: string | null
  deskewed: boolean
  blur: number | null
}

export type ScanOutcome =
  | { ok: true; prefill: ScanPrefill }
  | { ok: false; reason: 'provider' | 'blurry' | 'unreadable' | 'model' | 'unavailable'; note: string; blur?: number | null }

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ')

export async function scanChecksheet(imageBase64: string): Promise<ScanOutcome> {
  const provider = getChatProvider()
  const machines = listMachines()
  const technicians = listTechnicians()

  const res = await callAiService<ScanServiceResponse>('/scan/checksheet', {
    provider,
    imageBase64,
    machines: machines.map((m) => ({ name: m.name, code: m.code, points: m.checklist.map((c) => c.label) })),
    categories: FINDING_CATEGORIES,
    technicians: technicians.map((t) => t.displayName),
  })

  if (!res) {
    return { ok: false, reason: 'unavailable', note: 'The AI service is not reachable right now.' }
  }
  if (!res.supported) {
    return { ok: false, reason: 'provider', note: res.note ?? 'Scanning requires the Gemini engine.' }
  }
  if (!res.ok || !res.extraction) {
    return {
      ok: false,
      reason: res.reason === 'blurry' || res.reason === 'unreadable' ? res.reason : 'model',
      note: res.note ?? 'The sheet could not be read.',
      blur: res.blur ?? null,
    }
  }

  const ex = res.extraction
  const warnings: string[] = []

  // --- Machine: exact-ish name or code match, never a guess -------------------------
  const claimed = ex.machine ? norm(ex.machine) : ''
  const machine =
    machines.find((m) => norm(m.name) === claimed || norm(m.code) === claimed) ??
    // A sheet photographed at an angle can lose a character or two off the name; fall back
    // to containment before giving up, but only when it resolves to exactly one machine.
    (() => {
      if (!claimed) return undefined
      const hits = machines.filter((m) => norm(m.name).includes(claimed) || claimed.includes(norm(m.name)))
      return hits.length === 1 ? hits[0] : undefined
    })()

  if (!machine) {
    warnings.push(
      ex.machine
        ? `Could not match "${ex.machine}" to a known machine — select it manually.`
        : 'No machine could be read from the sheet — select it manually.',
    )
  }

  // --- Technician: match the handwritten name to a real user -------------------------
  const claimedTech = ex.technicianName ? norm(ex.technicianName) : ''
  const technician = claimedTech
    ? technicians.find((t) => norm(t.displayName) === claimedTech) ??
      technicians.find((t) => norm(t.displayName).includes(claimedTech) || claimedTech.includes(norm(t.displayName)))
    : undefined
  if (claimedTech && !technician) {
    warnings.push(`"${ex.technicianName}" is not a registered technician — select one manually.`)
  }

  // --- Rows: every label must belong to THIS machine's checklist ---------------------
  const answers: PrefillAnswer[] = []
  if (machine) {
    const byLabel = new Map(machine.checklist.map((c) => [norm(c.label), c]))
    const seen = new Set<number>()

    for (const p of ex.points ?? []) {
      const item = byLabel.get(norm(p.label))
      if (!item) {
        warnings.push(`Ignored an unrecognised inspection point: "${p.label}".`)
        continue
      }
      if (seen.has(item.id)) continue // duplicate row from the model — first read wins
      seen.add(item.id)

      // A category that is not one of the six real ones is dropped, not passed through.
      let category: string | null = null
      if (p.result === 'fail' && p.category) {
        const match = FINDING_CATEGORIES.find((c) => norm(c) === norm(p.category!))
        if (match) category = match
        else warnings.push(`Ignored an unrecognised finding category on "${item.label}": "${p.category}".`)
      }

      answers.push({
        checklistItemId: item.id,
        label: item.label,
        result: p.result === 'blank' ? null : p.result,
        category,
        // A fail with no usable category is exactly what the technician must fix before
        // submitting, so flag it for attention even if the model was confident.
        lowConfidenceResult: p.resultConfidence !== 'high',
        lowConfidenceCategory: p.result === 'fail' && (p.categoryConfidence !== 'high' || !category),
        photoAttached: p.photoAttached === 'yes',
      })
    }

    const missing = machine.checklist.filter((c) => !seen.has(c.id))
    if (missing.length) {
      warnings.push(
        `${missing.length} inspection point${missing.length > 1 ? 's were' : ' was'} not read from the sheet — complete ${
          missing.length > 1 ? 'them' : 'it'
        } manually.`,
      )
    }
  }

  return {
    ok: true,
    prefill: {
      machineId: machine?.id ?? null,
      machineName: machine?.name ?? ex.machine ?? null,
      machineLowConfidence: ex.machineConfidence !== 'high',
      technicianUserId: technician?.id ?? null,
      technicianName: technician?.displayName ?? ex.technicianName ?? null,
      technicianLowConfidence: ex.technicianConfidence !== 'high',
      paperDate: ex.date ?? null,
      answers,
      warnings,
      model: res.model ?? null,
      deskewed: res.deskewed ?? false,
      blur: res.blur ?? null,
    },
  }
}
