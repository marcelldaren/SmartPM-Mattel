import { sqlite } from '../client.js'

export function nextPartRequestCode(): string {
  const rows = sqlite.prepare('SELECT code FROM part_requests').all() as { code: string }[]
  const maxNum = rows.reduce((max, r) => Math.max(max, Number(r.code.replace('PR-', ''))), 114)
  return `PR-${maxNum + 1}`
}

export function insertPartRequest(p: {
  code: string
  findingId: number
  checksheetId: number
  machineId: number
  vendorId: number
  partName: string
  costIdr: number
  status: 'pending' | 'auto' | 'sent' | 'rejected'
  emailSubject: string
  emailBody: string
  draftedBy: 'template' | 'agent'
  note: string | null
  createdAt: string
  sentAt: string | null
  isSeed: boolean
  review?: { ok: boolean; issues: string[]; model: string | null } | null
}) {
  const result = sqlite
    .prepare(
      `INSERT INTO part_requests
         (code, finding_id, checksheet_id, machine_id, vendor_id, part_name, cost_idr, status,
          email_subject, email_body, drafted_by, note, created_at, sent_at, is_seed,
          review_ok, review_issues, review_model, reviewed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      p.code,
      p.findingId,
      p.checksheetId,
      p.machineId,
      p.vendorId,
      p.partName,
      p.costIdr,
      p.status,
      p.emailSubject,
      p.emailBody,
      p.draftedBy,
      p.note,
      p.createdAt,
      p.sentAt,
      p.isSeed ? 1 : 0,
      // NULL when no review was recorded — distinct from a review that failed.
      p.review ? (p.review.ok ? 1 : 0) : null,
      p.review ? JSON.stringify(p.review.issues) : null,
      p.review?.model ?? null,
      p.review ? new Date().toISOString() : null,
    )
  return Number(result.lastInsertRowid)
}

/** review_ok IS NULL means no review was recorded — return null so no badge renders. */
function parseReview(ok: unknown, issues: unknown): { ok: boolean; issues: string[] } | null {
  if (ok === null || ok === undefined) return null
  let parsed: string[] = []
  try {
    const raw = typeof issues === 'string' ? JSON.parse(issues) : []
    if (Array.isArray(raw)) parsed = raw.map((i) => String(i))
  } catch {
    parsed = []
  }
  return { ok: Boolean(ok), issues: parsed }
}

export interface ApprovalRow {
  id: string
  part: string
  machine: string
  finding: string
  source: string
  tech: string
  vendor: string
  vendorEmail: string
  cost: number
  status: string
  note: string | null
  sentAt: string | null
  generated: boolean
  email: { subject: string; body: string }
  /** null = not reviewed; the UI renders no badge at all in that case. */
  review: { ok: boolean; issues: string[] } | null
}

/** Shape matches the original SEED_APPROVALS mock exactly, so Approvals.jsx/Dashboard.jsx need no JSX changes. */
export function listPartRequests(): ApprovalRow[] {
  const rows = sqlite
    .prepare(
      `SELECT
         pr.code AS id, pr.part_name AS part, m.name AS machine, f.title AS finding,
         cs.code AS source, u.display_name AS tech, v.name AS vendor, v.email AS vendor_email,
         pr.cost_idr AS cost, pr.status AS status, pr.note AS note, pr.sent_at AS sent_at,
         pr.is_seed AS is_seed, pr.email_subject AS email_subject, pr.email_body AS email_body,
         pr.review_ok AS review_ok, pr.review_issues AS review_issues
       FROM part_requests pr
       JOIN machines m ON m.id = pr.machine_id
       JOIN findings f ON f.id = pr.finding_id
       JOIN checksheets cs ON cs.id = pr.checksheet_id
       JOIN users u ON u.id = cs.technician_user_id
       JOIN vendors v ON v.id = pr.vendor_id
       ORDER BY pr.created_at DESC, pr.id DESC`,
    )
    .all() as Record<string, unknown>[]

  return rows.map((r) => ({
    id: r.id as string,
    part: r.part as string,
    machine: r.machine as string,
    finding: r.finding as string,
    source: r.source as string,
    tech: r.tech as string,
    vendor: r.vendor as string,
    vendorEmail: r.vendor_email as string,
    cost: r.cost as number,
    status: r.status as string,
    note: (r.note as string) ?? null,
    sentAt: (r.sent_at as string) ?? null,
    generated: !r.is_seed,
    email: { subject: r.email_subject as string, body: r.email_body as string },
    review: parseReview(r.review_ok, r.review_issues),
  }))
}

export interface PendingItem {
  code: string
  part: string
  cost: number
  machine: string
  finding: string
  itemLabel: string
  source: string
  note: string | null
}

export interface VendorGroup {
  vendorId: number
  vendor: string
  vendorEmail: string
  items: PendingItem[]
  totalCost: number
}

/**
 * Pending part requests grouped by vendor — the deterministic input to the smart-
 * procurement agent, which drafts ONE consolidated PO per vendor instead of N separate
 * emails. Grouping and cost totals are computed here in code; the model only writes prose.
 */
export function listPendingGroupedByVendor(): VendorGroup[] {
  const rows = sqlite
    .prepare(
      `SELECT pr.code, pr.part_name AS part, pr.cost_idr AS cost, pr.note,
              m.name AS machine, f.title AS finding, ci.label AS item_label,
              v.id AS vendor_id, v.name AS vendor, v.email AS vendor_email, cs.code AS source
       FROM part_requests pr
       JOIN vendors v ON v.id = pr.vendor_id
       JOIN machines m ON m.id = pr.machine_id
       JOIN findings f ON f.id = pr.finding_id
       JOIN checklist_items ci ON ci.id = f.checklist_item_id
       JOIN checksheets cs ON cs.id = pr.checksheet_id
       WHERE pr.status = 'pending'
       ORDER BY v.name, pr.created_at`,
    )
    .all() as Record<string, unknown>[]

  const groups = new Map<number, VendorGroup>()
  for (const r of rows) {
    const vendorId = r.vendor_id as number
    if (!groups.has(vendorId)) {
      groups.set(vendorId, {
        vendorId,
        vendor: r.vendor as string,
        vendorEmail: r.vendor_email as string,
        items: [],
        totalCost: 0,
      })
    }
    const g = groups.get(vendorId)!
    g.items.push({
      code: r.code as string,
      part: r.part as string,
      cost: r.cost as number,
      machine: r.machine as string,
      finding: r.finding as string,
      itemLabel: r.item_label as string,
      source: r.source as string,
      note: (r.note as string) ?? null,
    })
    g.totalCost += r.cost as number
  }
  // Only vendors with more than one pending item are worth consolidating.
  return [...groups.values()].filter((g) => g.items.length > 1)
}

export function updatePartRequestStatus(code: string, status: 'sent' | 'rejected', sentAt: string | null) {
  sqlite.prepare('UPDATE part_requests SET status = ?, sent_at = ? WHERE code = ?').run(status, sentAt, code)
}

export function getPartRequestByCode(code: string) {
  return sqlite.prepare('SELECT * FROM part_requests WHERE code = ?').get(code) as Record<string, unknown> | undefined
}

export interface ConsolidatedApproval {
  vendorId: number
  vendor: string
  vendorEmail: string
  codes: string[]
  totalCost: number
}

/**
 * Resolve the pending requests a consolidated PO would actually cover.
 *
 * The caller passes the codes its UI displayed, but they are re-checked here against the
 * database: still pending, and genuinely belonging to this vendor. A stale panel (someone
 * approved one in another tab, or the list moved on) must not be able to sweep an
 * unrelated request into a batch send. The total is recomputed from stored costs too —
 * never taken from the client.
 */
export function resolveConsolidation(vendorId: number, codes: string[]): ConsolidatedApproval | null {
  if (!codes.length) return null
  const placeholders = codes.map(() => '?').join(', ')
  const rows = sqlite
    .prepare(
      `SELECT pr.code, pr.cost_idr AS cost, v.id AS vendor_id, v.name AS vendor, v.email AS vendor_email
         FROM part_requests pr
         JOIN vendors v ON v.id = pr.vendor_id
        WHERE pr.status = 'pending' AND pr.vendor_id = ? AND pr.code IN (${placeholders})`,
    )
    .all(vendorId, ...codes) as Record<string, unknown>[]

  // Every requested code must still be valid; a partial match means the UI is stale.
  if (rows.length === 0 || rows.length !== codes.length) return null

  return {
    vendorId,
    vendor: rows[0].vendor as string,
    vendorEmail: rows[0].vendor_email as string,
    codes: rows.map((r) => r.code as string),
    totalCost: rows.reduce((sum, r) => sum + (r.cost as number), 0),
  }
}

/** Mark a whole batch sent at once — all or nothing, so a partial send can't be recorded. */
export function markConsolidationSent(codes: string[], sentAt: string): number {
  if (!codes.length) return 0
  const stmt = sqlite.prepare(`UPDATE part_requests SET status = 'sent', sent_at = ? WHERE code = ? AND status = 'pending'`)
  sqlite.exec('BEGIN')
  try {
    let changed = 0
    for (const code of codes) changed += stmt.run(sentAt, code).changes as number
    sqlite.exec('COMMIT')
    return changed
  } catch (err) {
    sqlite.exec('ROLLBACK')
    throw err
  }
}
