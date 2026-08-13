import { Router } from 'express'
import { z } from 'zod'
import { requireAuth } from '../auth/middleware.js'
import { searchRecords } from '../ai/search.js'
import { asyncHandler } from '../util/asyncHandler.js'

export const searchRouter = Router()

const schema = z.object({ query: z.string().min(1) })

searchRouter.post('/api/search', requireAuth, asyncHandler(async (req, res) => {
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'A search query is required' })
    return
  }
  const result = await searchRecords(parsed.data.query)
  res.json(result)
}))
