import { Router } from 'express'
import { z } from 'zod'
import { requireAuth } from '../auth/middleware.js'
import { askAssistant } from '../ai/assistant.js'
import { asyncHandler } from '../util/asyncHandler.js'

export const assistantRouter = Router()

const schema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string(),
      }),
    )
    .min(1)
    .max(30),
})

assistantRouter.post(
  '/api/assistant',
  requireAuth,
  asyncHandler(async (req, res) => {
    const parsed = schema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'A messages array is required' })
      return
    }
    const result = await askAssistant(parsed.data.messages)
    res.json(result)
  }),
)
