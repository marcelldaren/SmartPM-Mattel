import { Router } from 'express'
import { requireAuth } from '../auth/middleware.js'
import { getPredictivePmInsights } from '../ai/insights.js'
import { asyncHandler } from '../util/asyncHandler.js'

export const insightsRouter = Router()

insightsRouter.get(
  '/api/insights',
  requireAuth,
  asyncHandler(async (_req, res) => {
    res.json(await getPredictivePmInsights())
  }),
)
