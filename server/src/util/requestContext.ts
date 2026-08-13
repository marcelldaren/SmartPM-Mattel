import { AsyncLocalStorage } from 'node:async_hooks'
import type { NextFunction, Request, Response } from 'express'

/**
 * Per-request context, currently just the caller's UI language.
 *
 * The alternative was threading `lang` through every function between the route and
 * `callAiService` — draftPartRequest, reviewDraft, searchRecords, askAssistant,
 * generatePmProposals and their repos — purely to carry a value none of them use. An
 * AsyncLocalStorage keeps that plumbing out of otherwise unrelated signatures, and the
 * AI client can read it at the one place it is actually needed.
 *
 * Background work (photo verification runs after the response is sent) captures the
 * language explicitly instead, because it outlives the request scope.
 */

export type Lang = 'en' | 'id'

interface RequestContext {
  lang: Lang
}

const storage = new AsyncLocalStorage<RequestContext>()

export function normalizeLang(value: unknown): Lang {
  return String(value ?? '').toLowerCase().startsWith('id') ? 'id' : 'en'
}

/** Reads the client's language header and scopes it to this request. */
export function requestContext(req: Request, _res: Response, next: NextFunction) {
  const lang = normalizeLang(req.header('x-smartpm-lang') ?? req.header('accept-language'))
  storage.run({ lang }, () => next())
}

/** Defaults to English outside a request (tests, scripts, background jobs). */
export function currentLang(): Lang {
  return storage.getStore()?.lang ?? 'en'
}
