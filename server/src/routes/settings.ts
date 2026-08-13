import { Router } from 'express'
import { z } from 'zod'
import { requireAuth, requireRole } from '../auth/middleware.js'
import {
  getApprovalThresholdIdr,
  getChatProvider,
  setApprovalThresholdIdr,
  setChatProvider,
} from '../db/repo/settings.js'
import { getAiHealth } from '../ai/client.js'
import { asyncHandler } from '../util/asyncHandler.js'

export const settingsRouter = Router()

settingsRouter.get(
  '/api/settings',
  requireAuth,
  asyncHandler(async (_req, res) => {
    const health = await getAiHealth()
    const provider = getChatProvider()
    // Node controls the provider via this DB setting (passed per request); /health only
    // reports the service's env defaults, so derive the active label from the DB provider.
    const chatModel =
      provider === 'gemini'
        ? health?.geminiKeyPresent
          ? 'Gemini'
          : 'Gemini (no API key set)'
        : (health?.chatModel ?? 'qwen2.5:3b')
    res.json({
      approvalThresholdIdr: getApprovalThresholdIdr(),
      chatProvider: provider,
      ai: {
        reachable: !!health,
        chatModel,
        embedModel: health?.embedModel ?? 'nomic-embed-text',
        geminiKeyPresent: health?.geminiKeyPresent ?? false,
      },
    })
  }),
)

const updateSchema = z.object({
  approvalThresholdIdr: z.number().int().min(0).optional(),
  chatProvider: z.enum(['ollama', 'gemini']).optional(),
})

// Only supervisors can change plant-wide settings.
settingsRouter.post(
  '/api/settings',
  requireAuth,
  requireRole('supervisor'),
  asyncHandler(async (req, res) => {
    const parsed = updateSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid settings', details: parsed.error.flatten() })
      return
    }
    if (parsed.data.approvalThresholdIdr !== undefined) {
      setApprovalThresholdIdr(parsed.data.approvalThresholdIdr)
    }
    if (parsed.data.chatProvider !== undefined) {
      setChatProvider(parsed.data.chatProvider)
    }
    res.json({ approvalThresholdIdr: getApprovalThresholdIdr(), chatProvider: getChatProvider() })
  }),
)
