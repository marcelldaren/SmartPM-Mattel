/**
 * Thin HTTP client for the Python AI service (FastAPI, default :5001).
 *
 * The AI layer lives in Python now; Node calls it over localhost HTTP. Every call is
 * tolerant by design — on timeout, connection failure, or a non-2xx response it returns
 * null, and the callers (agent.ts / search.ts) fall back to deterministic output. A
 * flaky or offline model must never break a checksheet submission or a search.
 */

import { currentLang } from '../util/requestContext.js'

const AI_SERVICE_URL = process.env.AI_SERVICE_URL ?? 'http://localhost:5001'
const TIMEOUT_MS = Number(process.env.AI_SERVICE_TIMEOUT_MS ?? 90_000)

export async function callAiService<T>(path: string, body: unknown): Promise<T | null> {
  // Every prompt should answer in the language the user is reading the UI in. Stamping it
  // here rather than at each call site means a new endpoint gets it for free, and no
  // intermediate function has to carry a `lang` argument it doesn't otherwise use.
  const payload =
    body && typeof body === 'object' && !Array.isArray(body)
      ? { lang: currentLang(), ...(body as Record<string, unknown>) }
      : body

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(`${AI_SERVICE_URL}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })
    if (!res.ok) {
      console.error(`AI service ${path} responded ${res.status}`)
      return null
    }
    return (await res.json()) as T
  } catch (err) {
    console.error(`AI service ${path} call failed:`, err instanceof Error ? err.message : err)
    return null
  } finally {
    clearTimeout(timer)
  }
}

export interface AiHealth {
  ok: boolean
  chatProvider: string
  chatModel: string
  embedProvider: string
  embedModel: string
  geminiKeyPresent: boolean
}

/** Reads the AI service's /health so the UI can show live model status. Returns null if it's down. */
export async function getAiHealth(): Promise<AiHealth | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 4_000)
  try {
    const res = await fetch(`${AI_SERVICE_URL}/health`, { signal: controller.signal })
    if (!res.ok) return null
    return (await res.json()) as AiHealth
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}
