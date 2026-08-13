import jwt from 'jsonwebtoken'

export interface TokenPayload {
  sub: number
  role: 'supervisor' | 'technician'
}

function secret(): string {
  const s = process.env.JWT_SECRET
  if (!s) throw new Error('JWT_SECRET is not set')
  return s
}

export function signToken(payload: TokenPayload): string {
  return jwt.sign(payload, secret(), { expiresIn: '8h' })
}

export function verifyToken(token: string): TokenPayload {
  return jwt.verify(token, secret()) as unknown as TokenPayload
}
