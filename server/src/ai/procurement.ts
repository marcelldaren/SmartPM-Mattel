import { callAiService } from './client.js'
import { listPendingGroupedByVendor, type VendorGroup } from '../db/repo/partRequests.js'
import { getChatProvider } from '../db/repo/settings.js'
import { fmtIdr } from '../db/util.js'
import { stripHtml } from '../util/text.js'

export interface Consolidation {
  vendorId: number
  vendor: string
  vendorEmail: string
  count: number
  totalCost: number
  items: VendorGroup['items']
  codes: string[]
  subject: string
  body: string
}

function fallbackBody(g: VendorGroup): string {
  const lines = g.items
    .map((it) => `- ${it.part} (${it.machine} — ${it.itemLabel}), Rp ${it.cost.toLocaleString('id-ID')}`)
    .join('\n')
  return `Dear ${g.vendor},\n\nFollowing preventive maintenance across several machines at PT Mattel Indonesia, we would like to consolidate the following part requests into a single purchase order:\n\n${lines}\n\nTotal estimated cost: Rp ${g.totalCost.toLocaleString('id-ID')}\n\nPlease confirm availability, lead time, and a consolidated quotation.\n\n— SmartPM automated request • PT Mattel Indonesia (PTMI)`
}

/**
 * Smart-procurement agent. The batching decision — which pending requests share a vendor
 * and their cost total — is deterministic (listPendingGroupedByVendor). The model only
 * drafts the consolidated PO email per vendor; a deterministic template covers any miss.
 * This never sends anything: each source request still flows through normal approval.
 */
export async function getConsolidations(): Promise<Consolidation[]> {
  const groups = listPendingGroupedByVendor()
  const out: Consolidation[] = []

  for (const g of groups) {
    const drafted = await callAiService<{ subject: string; body: string }>('/consolidate-po', {
      provider: getChatProvider(),
      vendor: g.vendor,
      totalCost: g.totalCost,
      items: g.items.map((it) => ({
        part: it.part,
        machine: it.machine,
        itemLabel: it.itemLabel,
        cost: it.cost,
        note: it.note,
      })),
    })

    const email =
      drafted && drafted.subject && drafted.body
        ? { subject: drafted.subject, body: drafted.body }
        : { subject: `Consolidated Part Request — ${g.items.length} items (${fmtIdr(g.totalCost)})`, body: fallbackBody(g) }

    out.push({
      vendorId: g.vendorId,
      vendor: g.vendor,
      vendorEmail: g.vendorEmail,
      count: g.items.length,
      totalCost: g.totalCost,
      items: g.items,
      codes: g.items.map((it) => it.code),
      subject: stripHtml(email.subject),
      body: stripHtml(email.body),
    })
  }

  return out
}
