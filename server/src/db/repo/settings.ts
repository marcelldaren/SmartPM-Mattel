import { sqlite } from '../client.js'

export function getSetting(key: string): string | undefined {
  const row = sqlite.prepare('SELECT value FROM app_settings WHERE key = ?').get(key) as
    | { value: string }
    | undefined
  return row?.value
}

export function setSetting(key: string, value: string) {
  sqlite
    .prepare(
      'INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    )
    .run(key, value)
}

/** Single source of truth for the auto-send threshold — read by both the agent tool and the Approvals UI. */
export function getApprovalThresholdIdr(): number {
  const raw = getSetting('approval_threshold_idr')
  return raw ? Number(raw) : 500_000
}

export function setApprovalThresholdIdr(value: number) {
  setSetting('approval_threshold_idr', String(Math.max(0, Math.round(value))))
}

export type ChatProvider = 'ollama' | 'gemini'

/**
 * Active chat/agent provider, controllable at runtime from the Settings screen. Node
 * passes this to the stateless Python service on every chat call, so flipping it takes
 * effect immediately with no restart. Embeddings deliberately stay local (see AI service)
 * so the stored vector space never changes underneath search.
 */
export function getChatProvider(): ChatProvider {
  return getSetting('chat_provider') === 'gemini' ? 'gemini' : 'ollama'
}

export function setChatProvider(provider: ChatProvider) {
  setSetting('chat_provider', provider === 'gemini' ? 'gemini' : 'ollama')
}
