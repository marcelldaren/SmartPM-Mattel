import { Router } from 'express'
import { requireAuth, requireRole } from '../auth/middleware.js'
import { getPartRequestByCode, listPartRequests, updatePartRequestStatus } from '../db/repo/partRequests.js'
import { sendMail } from '../email/mailer.js'
import { renderPartRequestEmail } from '../email/template.js'
import { asyncHandler } from '../util/asyncHandler.js'

export const partRequestsRouter = Router()

partRequestsRouter.get('/api/part-requests', requireAuth, (req, res) => {
  res.json(listPartRequests())
})

partRequestsRouter.post(
  '/api/part-requests/:code/approve',
  requireAuth,
  requireRole('supervisor'),
  asyncHandler(async (req, res) => {
    // The joined row carries the vendor/machine/cost detail the email template needs.
    const row = listPartRequests().find((r) => r.id === req.params.code)
    if (!row) {
      res.status(404).json({ error: 'Not found' })
      return
    }
    // Real email if SMTP is configured, otherwise a simulated send (status flip only) —
    // approval itself never blocks on the network.
    await sendMail(
      row.vendorEmail,
      row.email.subject,
      row.email.body,
      renderPartRequestEmail(row.email.body, {
        requestCode: row.id,
        partName: row.part,
        machine: row.machine,
        vendor: row.vendor,
        costIdr: row.cost,
        checksheet: row.source,
        finding: row.finding,
        note: row.note,
        autoApproved: false,
      }),
    )
    updatePartRequestStatus(req.params.code, 'sent', new Date().toISOString())
    res.json({ ok: true })
  }),
)

partRequestsRouter.post('/api/part-requests/:code/reject', requireAuth, requireRole('supervisor'), (req, res) => {
  const existing = getPartRequestByCode(req.params.code)
  if (!existing) {
    res.status(404).json({ error: 'Not found' })
    return
  }
  updatePartRequestStatus(req.params.code, 'rejected', null)
  res.json({ ok: true })
})
