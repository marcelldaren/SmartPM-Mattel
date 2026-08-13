import { Router } from 'express'
import { z } from 'zod'
import { requireAuth, requireRole } from '../auth/middleware.js'
import { getConsolidations } from '../ai/procurement.js'
import {
  listPartRequests,
  markConsolidationSent,
  resolveConsolidation,
} from '../db/repo/partRequests.js'
import { sendMail } from '../email/mailer.js'
import { renderConsolidatedPoEmail } from '../email/template.js'
import { asyncHandler } from '../util/asyncHandler.js'

export const procurementRouter = Router()

// Consolidation proposals are a supervisor/procurement concern (same gate as approvals).
procurementRouter.get(
  '/api/procurement/consolidations',
  requireAuth,
  requireRole('supervisor'),
  asyncHandler(async (_req, res) => {
    res.json(await getConsolidations())
  }),
)

const approveSchema = z.object({
  codes: z.array(z.string().min(1)).min(2), // consolidating one request is just a normal approval
  subject: z.string().min(1).max(300),
  body: z.string().min(1).max(8000),
})

/**
 * Approve a whole vendor batch and send ONE purchase order instead of one email per
 * request. Without this the consolidation was only ever a preview: approving the source
 * requests individually still produced a separate email each, which is the exact thing
 * consolidating is meant to avoid.
 *
 * The cost gate is untouched. Only requests already sitting in `pending` — i.e. ones that
 * a supervisor has to approve anyway — can be batched; auto-sent requests never reach this
 * queue. This changes how many emails go out, not who is allowed to authorise spending.
 */
procurementRouter.post(
  '/api/procurement/consolidations/:vendorId/approve',
  requireAuth,
  requireRole('supervisor'),
  asyncHandler(async (req, res) => {
    const parsed = approveSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid request', details: parsed.error.flatten() })
      return
    }

    // Re-validated against the database: every code must still be pending and belong to
    // this vendor. A stale panel cannot sweep in an unrelated or already-handled request.
    const batch = resolveConsolidation(Number(req.params.vendorId), parsed.data.codes)
    if (!batch) {
      res.status(409).json({
        error: 'These requests are no longer all pending for this vendor — refresh and try again.',
      })
      return
    }

    // Line items come from the stored rows the resolver just verified, never from the
    // client, so the figures the vendor reads are the ones Node computed.
    const rows = listPartRequests().filter((r) => batch.codes.includes(r.id))
    const lineItems = rows.map((r) => ({
      code: r.id,
      part: r.part,
      machine: r.machine,
      costIdr: r.cost,
    }))

    const emailed = await sendMail(
      batch.vendorEmail,
      parsed.data.subject,
      parsed.data.body,
      renderConsolidatedPoEmail(parsed.data.body, {
        vendor: batch.vendor,
        lineItems,
        totalIdr: batch.totalCost,
      }),
    )

    // Status flips whether or not SMTP is configured — same as the single-request flow,
    // where an unconfigured mailer degrades to a clearly-labelled simulated send.
    const sentAt = new Date().toISOString()
    const updated = markConsolidationSent(batch.codes, sentAt)

    res.json({
      vendor: batch.vendor,
      vendorEmail: batch.vendorEmail,
      codes: batch.codes,
      count: updated,
      totalCost: batch.totalCost,
      emailed,
      sentAt,
    })
  }),
)
