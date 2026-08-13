import { sqlite } from '../client.js'
import { camelizeRows } from '../util.js'

/**
 * Persistence for advisory photo verifications.
 *
 * A row is created in `pending` the moment a photo arrives, before the model is called,
 * so the UI has something concrete to poll for and a crashed/slow verification leaves a
 * visible trace instead of silently disappearing.
 */

export type VerificationStatus = 'pending' | 'done' | 'skipped' | 'failed'
export type Verdict = 'Consistent' | 'Uncertain' | 'Possible mismatch'

export interface PhotoVerificationRow {
  id: number
  itemLabel: string
  category: string
  photoName: string | null
  thumbnail: string | null
  status: VerificationStatus
  verdict: Verdict | null
  description: string | null
  reasoning: string | null
  note: string | null
  model: string | null
}

export function insertPendingVerification(v: {
  checksheetId: number
  findingId: number | null
  checklistItemId: number
  itemLabel: string
  category: string
  photoName: string | null
  thumbnail: string | null
  provider: string
  createdAt: string
}): number {
  const result = sqlite
    .prepare(
      `INSERT INTO photo_verifications
         (checksheet_id, finding_id, checklist_item_id, item_label, category, photo_name, thumbnail, status, provider, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
    )
    .run(
      v.checksheetId,
      v.findingId,
      v.checklistItemId,
      v.itemLabel,
      v.category,
      v.photoName,
      v.thumbnail,
      v.provider,
      v.createdAt,
    )
  return Number(result.lastInsertRowid)
}

export function completeVerification(
  id: number,
  v: {
    status: VerificationStatus
    verdict?: Verdict | null
    description?: string | null
    reasoning?: string | null
    note?: string | null
    model?: string | null
  },
) {
  sqlite
    .prepare(
      `UPDATE photo_verifications
          SET status = ?, verdict = ?, description = ?, reasoning = ?, note = ?, model = ?,
              completed_at = ?
        WHERE id = ?`,
    )
    .run(
      v.status,
      v.verdict ?? null,
      v.description ?? null,
      v.reasoning ?? null,
      v.note ?? null,
      v.model ?? null,
      new Date().toISOString(),
      id,
    )
}

export function listVerificationsForChecksheetCode(code: string): PhotoVerificationRow[] {
  return camelizeRows<PhotoVerificationRow>(
    sqlite
      .prepare(
        `SELECT pv.id, pv.item_label, pv.category, pv.photo_name, pv.thumbnail, pv.status, pv.verdict,
                pv.description, pv.reasoning, pv.note, pv.model
           FROM photo_verifications pv
           JOIN checksheets cs ON cs.id = pv.checksheet_id
          WHERE cs.code = ?
          ORDER BY pv.id`,
      )
      .all(code) as Record<string, unknown>[],
  )
}

/** Per-checksheet rollup for list views, keyed by checksheet code. */
export function verificationSummaryByChecksheetCode(): Record<
  string,
  { total: number; consistent: number; uncertain: number; mismatch: number; pending: number }
> {
  const rows = sqlite
    .prepare(
      `SELECT cs.code AS code, pv.status AS status, pv.verdict AS verdict
         FROM photo_verifications pv
         JOIN checksheets cs ON cs.id = pv.checksheet_id`,
    )
    .all() as { code: string; status: string; verdict: string | null }[]

  const out: Record<string, { total: number; consistent: number; uncertain: number; mismatch: number; pending: number }> = {}
  for (const r of rows) {
    const entry = (out[r.code] ??= { total: 0, consistent: 0, uncertain: 0, mismatch: 0, pending: 0 })
    entry.total++
    if (r.status === 'pending') entry.pending++
    else if (r.verdict === 'Consistent') entry.consistent++
    else if (r.verdict === 'Possible mismatch') entry.mismatch++
    else if (r.verdict === 'Uncertain') entry.uncertain++
  }
  return out
}
