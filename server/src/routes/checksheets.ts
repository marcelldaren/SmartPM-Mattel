import { Router } from 'express'
import { z } from 'zod'
import type { AuthedRequest } from '../auth/middleware.js'
import { requireAuth } from '../auth/middleware.js'
import { getChecklistItem, getMachineById } from '../db/repo/machines.js'
import { findUserById } from '../db/repo/users.js'
import { getVendorById } from '../db/repo/vendors.js'
import {
  insertChecksheet,
  insertChecksheetAnswer,
  nextChecksheetCode,
} from '../db/repo/checksheets.js'
import { insertFinding } from '../db/repo/findings.js'
import { insertPartRequest, nextPartRequestCode } from '../db/repo/partRequests.js'
import { listVerificationsForChecksheetCode } from '../db/repo/photoVerifications.js'
import { findAvailableStock, insertPullRequest } from '../db/repo/warehouse.js'
import { indexEntity } from '../ai/embed.js'
import { draftPartRequest } from '../ai/agent.js'
import { queueVerifications, runVerifications } from '../ai/vision.js'
import type { PendingPhoto } from '../ai/vision.js'
import { scanChecksheet } from '../ai/scan.js'
import { sendMail } from '../email/mailer.js'
import { renderPartRequestEmail } from '../email/template.js'
import { asyncHandler } from '../util/asyncHandler.js'

const PART_REQUEST_CATEGORIES = ['Damaged part', 'Needs replacement']

// Evidence photo attached to a failed checkpoint. `data` is raw base64 (no data: prefix);
// the client downscales before encoding, so this stays well under the body limit.
const photoSchema = z.object({
  name: z.string().max(255).optional().nullable(),
  mime: z.string().regex(/^image\/(jpeg|png|webp|heic|heif)$/i),
  data: z.string().min(1),
  // Small data-URL preview stored with the verdict so the photo can be shown beside it.
  thumbnail: z.string().max(200_000).optional().nullable(),
})

const bodySchema = z.object({
  machineId: z.number().int(),
  technicianUserId: z.number().int().optional(),
  answers: z
    .array(
      z.object({
        checklistItemId: z.number().int(),
        result: z.enum(['pass', 'fail']),
        category: z.string().optional().nullable(),
        photo: photoSchema.optional().nullable(),
      }),
    )
    .min(1),
})

export const checksheetsRouter = Router()

checksheetsRouter.post('/api/checksheets', requireAuth, asyncHandler<AuthedRequest>(async (req, res) => {
  const parsed = bodySchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid request', details: parsed.error.flatten() })
    return
  }
  const { machineId, answers } = parsed.data

  const machine = getMachineById(machineId) as { id: number; name: string } | undefined
  if (!machine) {
    res.status(404).json({ error: 'Machine not found' })
    return
  }

  const technicianUserId = req.user!.role === 'technician' ? req.user!.id : parsed.data.technicianUserId
  if (!technicianUserId) {
    res.status(400).json({ error: 'technicianUserId is required when submitting as a supervisor' })
    return
  }
  const technician = findUserById(technicianUserId)
  if (!technician || technician.role !== 'technician' || !technician.vendorId) {
    res.status(400).json({ error: 'Invalid technician' })
    return
  }
  const vendor = getVendorById(technician.vendorId)
  if (!vendor) {
    res.status(400).json({ error: 'Technician has no associated vendor' })
    return
  }

  for (const a of answers) {
    if (a.result === 'fail' && !a.category) {
      res.status(400).json({ error: `Answer for checklist item ${a.checklistItemId} is marked fail but has no category` })
      return
    }
  }

  const failAnswers = answers.filter((a) => a.result === 'fail')
  const hasPartRequest = failAnswers.some((a) => PART_REQUEST_CATEGORIES.includes(a.category!))
  const status = failAnswers.length === 0 ? 'Complete' : hasPartRequest ? 'Pending Approval' : 'Flagged'

  const now = new Date().toISOString()
  const code = nextChecksheetCode()
  const checksheetId = insertChecksheet({
    code,
    machineId,
    technicianUserId,
    workOrderCode: `WO-${code}`,
    status,
    submittedAt: now,
    isSeed: false,
  })

  for (const a of answers) {
    insertChecksheetAnswer({
      checksheetId,
      checklistItemId: a.checklistItemId,
      result: a.result,
      category: a.category ?? null,
    })
  }

  const newFindings: Array<{ id: string; title: string; item: string; severity: string }> = []
  const newRequests: Array<{ id: string; part: string; cost: number; status: string }> = []
  const newPulls: Array<{ id: string; part: string; sku: string; bin: string; quantity: number }> = []
  const photos: PendingPhoto[] = []

  for (const a of failAnswers) {
    const item = getChecklistItem(a.checklistItemId) as { id: number; label: string } | undefined
    if (!item) continue
    const category = a.category!
    const severity: 'High' | 'Medium' = category === 'Damaged part' ? 'High' : 'Medium'

    const needsPart = PART_REQUEST_CATEGORIES.includes(category)

    // Warehouse first. This is a plain SQL lookup, not a model call — whether the part is
    // on the shelf is a fact the database already holds. Buying something we already own
    // is the expensive mistake here, so the cheap local check runs before the agent does
    // any work at all: no recurrence lookup, no drafting call, no self-review, no email.
    const stock = needsPart
      ? findAvailableStock({ category, machineId, checklistItemId: a.checklistItemId })
      : undefined

    // Vendor path is entered only when nothing can be pulled. Unchanged from before.
    // Draft (and its recurrence lookup) must run before this finding is inserted, or the
    // agent's "how many times before" check would count this submission against itself.
    const draft = needsPart && !stock
      ? await draftPartRequest({
          vendorName: vendor.name,
          machineName: machine.name,
          findingTitle: category,
          itemLabel: item.label,
          checksheetCode: code,
          category,
          machineId,
          checklistItemId: a.checklistItemId,
        })
      : null

    const findingId = insertFinding({
      checksheetId,
      checklistItemId: a.checklistItemId,
      machineId,
      title: category,
      itemLabel: item.label,
      category,
      severity,
      createdAt: now,
    })
    await indexEntity('finding', findingId, `${category} — ${item.label} — ${machine.name} — ${severity} severity`)
    newFindings.push({ id: `F-${findingId}`, title: category, item: item.label, severity })

    if (a.photo) {
      photos.push({
        checksheetId,
        findingId,
        checklistItemId: a.checklistItemId,
        itemLabel: item.label,
        category,
        machineName: machine.name,
        photoName: a.photo.name ?? null,
        mime: a.photo.mime,
        data: a.photo.data,
        thumbnail: a.photo.thumbnail ?? null,
      })
    }

    // In stock: raise an internal pull request instead. No vendor, no cost, no threshold,
    // no email. Stock is NOT decremented here — the count only moves when a human confirms
    // they physically collected it (see confirmPickup), because inventory records go stale
    // and a silent decrement would turn a wrong record into a wrong record nobody notices.
    if (stock) {
      const iprCode = insertPullRequest({
        warehousePartId: stock.id,
        findingId,
        checksheetId,
        machineId,
        technicianUserId,
        partName: stock.partName,
        sku: stock.sku,
        binLocation: stock.binLocation,
        quantity: 1,
        itemLabel: item.label,
        category,
        note: null,
        createdAt: now,
      })
      newPulls.push({
        id: iprCode,
        part: stock.partName,
        sku: stock.sku,
        bin: stock.binLocation,
        quantity: 1,
      })
    }

    if (draft) {
      const prCode = nextPartRequestCode()
      // Auto-approved requests send immediately — a real email if SMTP is configured,
      // otherwise the status still moves to "auto/sent" as a simulated send.
      if (draft.status === 'auto') {
        await sendMail(
          vendor.email,
          draft.subject,
          draft.body,
          renderPartRequestEmail(draft.body, {
            requestCode: prCode,
            partName: draft.partName,
            machine: machine.name,
            vendor: vendor.name,
            costIdr: draft.costIdr,
            checksheet: code,
            finding: category,
            note: draft.note,
            autoApproved: true,
          }),
        )
      }
      insertPartRequest({
        code: prCode,
        findingId,
        checksheetId,
        machineId,
        vendorId: vendor.id,
        partName: draft.partName,
        costIdr: draft.costIdr,
        status: draft.status,
        emailSubject: draft.subject,
        emailBody: draft.body,
        draftedBy: 'agent',
        note: draft.note,
        createdAt: now,
        sentAt: draft.status === 'auto' ? now : null,
        isSeed: false,
        // Advisory only. Note this is stored *after* the auto-send above already ran —
        // the review has no say in whether the email goes out, by construction.
        review: draft.review,
      })
      newRequests.push({ id: prCode, part: draft.partName, cost: draft.costIdr, status: draft.status })
    }
  }

  // Rows are written synchronously (local SQLite, no network) so the response can tell the
  // client exactly what is being checked; the model calls themselves run after the
  // response is flushed. Photo verification is advisory and must never delay a submission.
  const queued = queueVerifications(photos, now)

  res.json({
    sheet: { id: code, machine: machine.name, status, findings: failAnswers.length },
    findings: newFindings,
    requests: newRequests,
    pulls: newPulls,
    verifications: queued.map((q) => ({ id: q.id, item: q.photo.itemLabel, status: 'pending' })),
  })

  if (queued.length) {
    // Intentionally not awaited: runVerifications owns its own error handling, so nothing
    // here can reject into the already-completed request.
    void runVerifications(queued)
  }
}))

/** Poll target for the advisory verification results kicked off by a submission. */
checksheetsRouter.get('/api/checksheets/:code/verifications', requireAuth, (req, res) => {
  res.json(listVerificationsForChecksheetCode(req.params.code))
})

const scanSchema = z.object({
  // Larger than an evidence photo: reading pen ticks off a full A4 page needs resolution
  // that a 1024px downscale throws away. Still bounded by the 12mb body limit in app.ts.
  imageBase64: z.string().min(1).max(9_000_000),
})

/**
 * Read a photographed paper checksheet into a DRAFT for the digital form.
 *
 * This endpoint is intentionally read-only: it creates no checksheet, no finding and no
 * part request. The technician reviews the returned draft in the normal form and submits
 * it through POST /api/checksheets above, which re-validates every field independently.
 * There is exactly one write path for a checksheet, and this is not it.
 */
checksheetsRouter.post('/api/checksheets/scan', requireAuth, asyncHandler<AuthedRequest>(async (req, res) => {
  const parsed = scanSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid request', details: parsed.error.flatten() })
    return
  }

  const outcome = await scanChecksheet(parsed.data.imageBase64)
  if (!outcome.ok) {
    // 200 with ok:false, not an HTTP error — "too blurry, retake" is a normal, expected
    // result the UI renders as guidance, not an exception.
    res.json({ ok: false, reason: outcome.reason, note: outcome.note, blur: outcome.blur ?? null })
    return
  }
  res.json({ ok: true, ...outcome.prefill })
}))
