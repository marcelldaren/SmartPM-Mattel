import type { NextFunction, Request, Response } from 'express'
import { verifyToken } from './jwt.js'
import { findUserById } from '../db/repo/users.js'

export interface AuthedUser {
  id: number
  role: 'supervisor' | 'technician'
  displayName: string
  vendorId: number | null
}

export interface AuthedRequest extends Request {
  user?: AuthedUser
}

export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const token = req.cookies?.token as string | undefined
  if (!token) {
    res.status(401).json({ error: 'Not authenticated' })
    return
  }
  try {
    const payload = verifyToken(token)
    const user = findUserById(payload.sub)
    if (!user) {
      res.status(401).json({ error: 'Not authenticated' })
      return
    }
    req.user = { id: user.id, role: user.role, displayName: user.displayName, vendorId: user.vendorId }
    next()
  } catch {
    res.status(401).json({ error: 'Not authenticated' })
  }
}

export function requireRole(role: AuthedUser['role']) {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    if (req.user?.role !== role) {
      res.status(403).json({ error: 'Forbidden' })
      return
    }
    next()
  }
}
