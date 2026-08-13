export function toCamel(s: string): string {
  return s.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase())
}

export function camelizeRow<T = Record<string, unknown>>(
  row: Record<string, unknown> | undefined,
): T | undefined {
  if (!row) return undefined
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(row)) out[toCamel(k)] = v
  return out as T
}

export function camelizeRows<T = Record<string, unknown>>(
  rows: Record<string, unknown>[],
): T[] {
  return rows.map((r) => camelizeRow<T>(r)!)
}

/** Human-friendly relative/absolute label matching the original mock data's "Today 09:41" style strings. */
export function formatDateLabel(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const isToday = d.toDateString() === now.toDateString()
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  const isYesterday = d.toDateString() === yesterday.toDateString()
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  if (isToday) return `Today ${time}`
  if (isYesterday) return `Yesterday ${time}`
  const day = d.toLocaleDateString('en-GB', { month: 'short', day: 'numeric' })
  return `${day}, ${time}`
}

export function fmtIdr(n: number): string {
  return 'Rp ' + n.toLocaleString('id-ID')
}

export function relativeWhen(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diffMs / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days === 1) return 'Yesterday'
  return new Date(iso).toLocaleDateString('en-GB', { month: 'short', day: 'numeric' })
}

/**
 * Structured form of a machine's PM-due label.
 *
 * The label is stored as English free text ("Overdue by 4 days"), which cannot be
 * translated at render time. Rather than rewrite the seeded data — and risk changing what
 * the dashboard shows — the stored string is parsed into a shape the client can re-render
 * in either language. The original label still ships alongside it as a fallback for
 * anything this doesn't recognise.
 */
export interface DueInfo {
  kind: 'today' | 'in' | 'overdue' | 'on' | 'raw'
  days?: number
  /** For kind 'on': the parsed date as ISO, so the client can format it per locale. */
  date?: string
}

export function parseDueLabel(label: string): DueInfo {
  const text = (label ?? '').trim()
  if (/due today/i.test(text)) return { kind: 'today' }

  const overdue = /overdue by (\d+)\s*day/i.exec(text)
  if (overdue) return { kind: 'overdue', days: Number(overdue[1]) }

  const inDays = /due in (\d+)\s*day/i.exec(text)
  if (inDays) return { kind: 'in', days: Number(inDays[1]) }

  const onDate = /^due\s+(.+)$/i.exec(text)
  if (onDate) {
    const parsed = new Date(`${onDate[1]} ${new Date().getFullYear()}`)
    if (!Number.isNaN(parsed.getTime())) {
      const m = String(parsed.getMonth() + 1).padStart(2, '0')
      const d = String(parsed.getDate()).padStart(2, '0')
      return { kind: 'on', date: `${parsed.getFullYear()}-${m}-${d}` }
    }
  }
  return { kind: 'raw' }
}
