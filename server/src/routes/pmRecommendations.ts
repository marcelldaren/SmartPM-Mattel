import { Router } from 'express'
import type { AuthedRequest } from '../auth/middleware.js'
import { requireAuth, requireRole } from '../auth/middleware.js'
import {
  approvePmRecommendation,
  dismissPmRecommendation,
  listPmRecommendations,
  listScheduleChanges,
} from '../db/repo/pmRecommendations.js'
import { generatePmProposals } from '../ai/pmProposals.js'
import { asyncHandler } from '../util/asyncHandler.js'

export const pmRecommendationsRouter = Router()

/** Proposals plus the audit trail of schedule changes already applied. */
pmRecommendationsRouter.get('/api/pm-recommendations', requireAuth, (_req, res) => {
  res.json({ recommendations: listPmRecommendations(), changes: listScheduleChanges() })
})

/**
 * Run detection -> deterministic date maths -> prose, creating pending proposals.
 * Supervisor-only: this is the step that puts an actionable schedule change in front of
 * someone. Never applies anything itself.
 */
pmRecommendationsRouter.post(
  '/api/pm-recommendations/generate',
  requireAuth,
  requireRole('supervisor'),
  asyncHandler(async (_req, res) => {
    const result = await generatePmProposals()
    res.json({ ...result, recommendations: listPmRecommendations() })
  }),
)

/** The only path that writes machines.next_pm_due_date. */
pmRecommendationsRouter.post(
  '/api/pm-recommendations/:id/approve',
  requireAuth,
  requireRole('supervisor'),
  (req, res) => {
    const updated = approvePmRecommendation(Number(req.params.id), (req as AuthedRequest).user!.id)
    if (!updated) {
      res.status(404).json({ error: 'Recommendation not found or already decided' })
      return
    }
    res.json(updated)
  },
)

/** Status change only — the schedule is deliberately left untouched. */
pmRecommendationsRouter.post(
  '/api/pm-recommendations/:id/dismiss',
  requireAuth,
  requireRole('supervisor'),
  (req, res) => {
    const updated = dismissPmRecommendation(Number(req.params.id), (req as AuthedRequest).user!.id)
    if (!updated) {
      res.status(404).json({ error: 'Recommendation not found or already decided' })
      return
    }
    res.json(updated)
  },
)
