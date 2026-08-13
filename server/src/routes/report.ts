import { Router } from 'express'
import { requireAuth } from '../auth/middleware.js'
import { generateReport } from '../ai/report.js'
import { asyncHandler } from '../util/asyncHandler.js'

export const reportRouter = Router()

reportRouter.get(
  '/api/report',
  requireAuth,
  asyncHandler(async (_req, res) => {
    res.json(await generateReport())
  }),
)
