import { Router } from 'express'
import { z } from 'zod'
import { findUserByUsername } from '../db/repo/users.js'
import { verifyPassword } from '../auth/password.js'
import { signToken } from '../auth/jwt.js'
import { requireAuth, type AuthedRequest } from '../auth/middleware.js'
import { asyncHandler } from '../util/asyncHandler.js'

const loginSchema = z.object({ username: z.string().min(1), password: z.string().min(1) })

export const authRouter = Router()

authRouter.post('/api/auth/login', asyncHandler(async (req, res) => {
  const parsed = loginSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'Username and password are required' })
    return
  }
  const user = findUserByUsername(parsed.data.username)
  if (!user) {
    res.status(401).json({ error: 'Invalid username or password' })
    return
  }
  const ok = await verifyPassword(parsed.data.password, user.passwordHash)
  if (!ok) {
    res.status(401).json({ error: 'Invalid username or password' })
    return
  }
  const token = signToken({ sub: user.id, role: user.role })
  res.cookie('token', token, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 8 * 60 * 60 * 1000,
  })
  res.json({ id: user.id, displayName: user.displayName, role: user.role })
}))

authRouter.post('/api/auth/logout', (req, res) => {
  res.clearCookie('token')
  res.json({ ok: true })
})

authRouter.get('/api/me', requireAuth, (req: AuthedRequest, res) => {
  res.json(req.user)
})
