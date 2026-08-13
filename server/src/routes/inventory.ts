import { Router } from 'express'
import { z } from 'zod'
import type { AuthedRequest } from '../auth/middleware.js'
import { requireAuth } from '../auth/middleware.js'
import {
  confirmPickup,
  getPullRequestByCode,
  listPullRequests,
  listWarehouseParts,
  reportDiscrepancy,
} from '../db/repo/warehouse.js'

export const inventoryRouter = Router()

/** Stock list plus the summary counts the screen header shows. */
inventoryRouter.get('/api/inventory', requireAuth, (_req, res) => {
  const parts = listWarehouseParts()
  res.json({
    parts,
    summary: {
      tracked: parts.length,
      low: parts.filter((p) => p.level === 'low').length,
      out: parts.filter((p) => p.level === 'out').length,
      needsRecount: parts.filter((p) => p.needsRecount).length,
    },
  })
})

inventoryRouter.get('/api/pull-requests', requireAuth, (_req, res) => {
  res.json(listPullRequests())
})

/**
 * Only the technician the part was raised for, or a supervisor, may resolve a pull
 * request. There is no separate warehouse role in the user model, so a supervisor stands
 * in for the storeroom coordinator.
 */
function canResolve(req: AuthedRequest, technicianUserId: number): boolean {
  return req.user!.role === 'supervisor' || req.user!.id === technicianUserId
}

/** The only path that decrements warehouse stock. */
inventoryRouter.post('/api/pull-requests/:code/pickup', requireAuth, (req, res) => {
  const authed = req as AuthedRequest
  const existing = getPullRequestByCode(req.params.code)
  if (!existing) {
    res.status(404).json({ error: 'Pull request not found' })
    return
  }
  if (!canResolve(authed, existing.technicianUserId)) {
    res.status(403).json({ error: 'Only the assigned technician or a supervisor can confirm this pickup' })
    return
  }
  const updated = confirmPickup(req.params.code, authed.user!.id, new Date().toISOString())
  if (!updated) {
    res.status(409).json({ error: 'Pull request is no longer awaiting pickup' })
    return
  }
  res.json(updated)
})

const discrepancySchema = z.object({ note: z.string().max(300).optional().nullable() })

/** Flags the stock record for recount. Deliberately does not change the quantity. */
inventoryRouter.post('/api/pull-requests/:code/discrepancy', requireAuth, (req, res) => {
  const authed = req as AuthedRequest
  const parsed = discrepancySchema.safeParse(req.body ?? {})
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid request' })
    return
  }
  const existing = getPullRequestByCode(req.params.code)
  if (!existing) {
    res.status(404).json({ error: 'Pull request not found' })
    return
  }
  if (!canResolve(authed, existing.technicianUserId)) {
    res.status(403).json({ error: 'Only the assigned technician or a supervisor can report this' })
    return
  }
  const updated = reportDiscrepancy(
    req.params.code,
    authed.user!.id,
    new Date().toISOString(),
    parsed.data.note?.trim() || null,
  )
  if (!updated) {
    res.status(409).json({ error: 'Pull request is no longer awaiting pickup' })
    return
  }
  res.json(updated)
})
