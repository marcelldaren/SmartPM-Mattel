import { callAiService } from './client.js'
import { getChatProvider } from '../db/repo/settings.js'
import { completeVerification, insertPendingVerification } from '../db/repo/photoVerifications.js'
import type { Verdict } from '../db/repo/photoVerifications.js'

/**
 * Advisory photo verification.
 *
 * A technician's evidence photo is checked against the finding category they claimed.
 * This is strictly advisory: it never blocks, delays, or alters a submission, and every
 * failure path (no vision support, model error, timeout, junk response) resolves to a
 * recorded non-verdict rather than an exception reaching the request that started it.
 */

export interface PendingPhoto {
  checksheetId: number
  findingId: number | null
  checklistItemId: number
  itemLabel: string
  category: string
  machineName: string
  photoName: string | null
  mime: string
  /** Raw base64, no `data:` prefix. */
  data: string
  /** Small data-URL preview persisted with the verdict; null if the client sent none. */
  thumbnail: string | null
}

interface VisionVerifyResponse {
  supported: boolean
  verdict?: Verdict | null
  description?: string | null
  reasoning?: string | null
  model?: string | null
  note?: string | null
}

/**
 * Record every photo as `pending` and hand back the row ids paired with their photos.
 * Called inline during submission because it is pure local SQLite — no network — so the
 * response can tell the client exactly what will be verified.
 */
export function queueVerifications(photos: PendingPhoto[], createdAt: string): Array<{ id: number; photo: PendingPhoto }> {
  const provider = getChatProvider()
  return photos.map((photo) => ({
    id: insertPendingVerification({
      checksheetId: photo.checksheetId,
      findingId: photo.findingId,
      checklistItemId: photo.checklistItemId,
      itemLabel: photo.itemLabel,
      category: photo.category,
      photoName: photo.photoName,
      thumbnail: photo.thumbnail,
      provider,
      createdAt,
    }),
    photo,
  }))
}

/**
 * Resolve queued verifications. Intended to be called WITHOUT await after the response
 * has been sent — it owns its own error handling end to end so an unhandled rejection can
 * never escape into the submission path.
 */
export async function runVerifications(queued: Array<{ id: number; photo: PendingPhoto }>): Promise<void> {
  const provider = getChatProvider()

  for (const { id, photo } of queued) {
    try {
      const res = await callAiService<VisionVerifyResponse>('/vision/verify', {
        provider,
        imageBase64: photo.data,
        mime: photo.mime,
        category: photo.category,
        machineName: photo.machineName,
        itemLabel: photo.itemLabel,
      })

      if (!res) {
        completeVerification(id, { status: 'failed', note: 'AI service unreachable or timed out.' })
        continue
      }
      if (!res.supported) {
        completeVerification(id, {
          status: 'skipped',
          note: res.note ?? 'Visual verification requires the Gemini engine.',
        })
        continue
      }
      if (!res.verdict) {
        completeVerification(id, {
          status: 'failed',
          note: res.note ?? 'Model returned no usable verdict.',
          model: res.model ?? null,
        })
        continue
      }

      completeVerification(id, {
        status: 'done',
        verdict: res.verdict,
        description: res.description ?? null,
        reasoning: res.reasoning ?? null,
        model: res.model ?? null,
      })
    } catch (err) {
      console.error('photo verification failed:', err)
      completeVerification(id, {
        status: 'failed',
        note: err instanceof Error ? err.message.slice(0, 300) : 'Verification failed.',
      })
    }
  }
}
