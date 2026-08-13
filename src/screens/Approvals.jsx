import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ChevronDown, CircleCheck, History, Layers, LoaderCircle, Mail, PackageCheck, PackageSearch,
  Send, ShieldCheck, Sparkles, TriangleAlert, Warehouse, X, Zap,
} from 'lucide-react'
import { Btn, Card, ScreenHeader, SoftIcon } from '../components/ui'
import { ApprovalsArt, EmptyState } from '../components/EmptyState'
import { ReviewBadge } from '../components/ReviewBadge'
import { PullRequestRow } from './InventoryScreen'
import { fmtIDR } from '../data'
import { api } from '../lib/api'
import { useI18n } from '../lib/i18n'
import { useToast } from '../lib/toast'

export default function Approvals() {
  const { t, tv } = useI18n()
  const queryClient = useQueryClient()
  const toast = useToast()
  const [open, setOpen] = useState({})

  const { data: approvals = [], isLoading } = useQuery({ queryKey: ['partRequests'], queryFn: api.partRequests })
  const { data: pulls = [] } = useQuery({ queryKey: ['pullRequests'], queryFn: api.pullRequests })
  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: api.settings })
  const threshold = settings?.approvalThresholdIdr ?? 0

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['partRequests'] })
    queryClient.invalidateQueries({ queryKey: ['dashboard'] })
  }

  const approveMutation = useMutation({
    mutationFn: (code) => api.approve(code),
    onSuccess: (_d, code) => {
      invalidate()
      toast(`${code} approved — email sent to vendor`, 'success')
    },
    onError: (e) => toast(e.message || 'Could not approve request', 'error'),
  })
  const rejectMutation = useMutation({
    mutationFn: (code) => api.reject(code),
    onSuccess: (_d, code) => {
      invalidate()
      toast(`${code} rejected — no email sent`, 'info')
    },
    onError: (e) => toast(e.message || 'Could not reject request', 'error'),
  })

  const pending = approvals.filter((a) => a.status === 'pending')
  const pendingTotal = pending.reduce((n, a) => n + a.cost, 0)

  // Count vendors with more than one pending request — the agent can only consolidate those.
  const vendorCounts = pending.reduce((acc, a) => ({ ...acc, [a.vendor]: (acc[a.vendor] ?? 0) + 1 }), {})
  const consolidatable = Object.values(vendorCounts).filter((n) => n > 1).length

  return (
    <>
      <ScreenHeader
        title={t('appr.title')}
        sub={
          pending.length
            ? `${pending.length} auto-drafted part request${pending.length > 1 ? 's' : ''} waiting · ${fmtIDR(pendingTotal)} total estimated`
            : t('appr.none')
        }
      >
        <span className="flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-1.5 text-xs font-medium text-ink-soft">
          <ShieldCheck size={14} className="text-success" /> {t('appr.autoSendBelow')} {fmtIDR(threshold)}
        </span>
      </ScreenHeader>

      <PullRequestPanel pulls={pulls} />

      {consolidatable > 0 && <ConsolidationPanel count={consolidatable} />}

      {isLoading && (
        <div className="grid place-items-center py-16">
          <LoaderCircle size={22} className="animate-spin text-primary" />
        </div>
      )}

      {!isLoading && pending.length === 0 && (
        <Card className="animate-rise mb-6 p-8">
          <EmptyState
            art={ApprovalsArt}
            title={t('appr.emptyTitle')}
            body={t('appr.emptyBody')}
          />
        </Card>
      )}

      {approvals.length > 0 && (
        <div className="mb-3 flex items-center gap-2">
          <Mail size={15} className="text-primary" />
          <h2 className="text-sm font-semibold">{t('appr.vendorSection')}</h2>
          <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-medium text-ink-faint">
            {t('appr.vendorSectionHint')}
          </span>
        </div>
      )}

      <div className="space-y-4">
        {approvals.map((a) => (
          <ApprovalCard
            key={a.id}
            a={a}
            sending={approveMutation.isPending && approveMutation.variables === a.id}
            expanded={!!open[a.id]}
            toggle={() => setOpen((o) => ({ ...o, [a.id]: !o[a.id] }))}
            approve={() => approveMutation.mutate(a.id)}
            reject={() => rejectMutation.mutate(a.id)}
          />
        ))}
      </div>
    </>
  )
}

function ApprovalCard({ a, sending, expanded, toggle, approve, reject }) {
  const tone = a.status === 'pending' ? 'primary' : a.status === 'rejected' ? 'neutral' : 'success'

  return (
    <Card className={`overflow-hidden ${a.status === 'rejected' ? 'opacity-70' : ''}`}>
      <div className="flex flex-wrap items-start justify-between gap-4 p-4">
        <div className="flex min-w-0 items-start gap-3">
          <SoftIcon icon={Mail} tone={tone} />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-semibold">{a.part}</h3>
              {a.generated && (
                <span className="rounded-full bg-primary-50 px-1.5 py-px text-[10px] font-bold text-primary">NEW</span>
              )}
            </div>
            <p className="mt-0.5 text-xs text-ink-faint">
              {a.machine} · {a.finding} · from {a.source} by {a.tech}
            </p>
            {a.note && (
              <p className="mt-1 flex items-center gap-1 text-xs font-medium text-accent-700">
                <History size={12} /> {a.note}
              </p>
            )}
            <div className="mt-1.5">
              <ReviewBadge review={a.review} />
            </div>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <p className="readout text-base font-bold">{fmtIDR(a.cost)}</p>
          <div className="mt-1.5 flex justify-end">
            {a.status === 'pending' && (
              <span className="inline-flex items-center gap-1 rounded-full bg-accent-50 px-2 py-0.5 text-[11px] font-semibold text-accent-700">
                <TriangleAlert size={11} /> Needs approval
              </span>
            )}
            {a.status === 'auto' && (
              <span className="inline-flex items-center gap-1 rounded-full bg-success-50 px-2 py-0.5 text-[11px] font-semibold text-success">
                <Zap size={11} /> Auto-sent{a.sentAt ? ` · ${new Date(a.sentAt).toLocaleString()}` : ''}
              </span>
            )}
            {a.status === 'sent' && (
              <span className="inline-flex items-center gap-1 rounded-full bg-success-50 px-2 py-0.5 text-[11px] font-semibold text-success">
                <CircleCheck size={11} /> Sent{a.sentAt ? ` · ${new Date(a.sentAt).toLocaleString()}` : ''}
              </span>
            )}
            {a.status === 'rejected' && (
              <span className="inline-flex items-center gap-1 rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-semibold text-neutral-500">
                <X size={11} /> Rejected
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Drafted email preview */}
      <div className="mx-4 mb-4 rounded-lg border border-line/70 bg-neutral-50 p-3.5">
        <div className="space-y-0.5 text-xs text-ink-faint">
          <p>From: SmartPM &lt;pm-bot@ptmi.co.id&gt;</p>
          <p>
            To: {a.vendorEmail} ({a.vendor})
          </p>
        </div>
        <p className="mt-2 text-[13px] font-semibold text-ink">{a.email.subject}</p>
        <div className="my-2.5 border-t border-line/60" />
        <p className={`whitespace-pre-line text-[13px] leading-relaxed text-ink-soft ${expanded ? '' : 'line-clamp-3'}`}>
          {a.email.body}
        </p>
        <button
          type="button"
          onClick={toggle}
          className="mt-2 flex cursor-pointer items-center gap-1 text-xs font-medium text-primary hover:underline"
        >
          <ChevronDown size={13} className={`transition-transform ${expanded ? 'rotate-180' : ''}`} />
          {expanded ? 'Collapse' : 'Show full email'}
        </button>
        {a.review && !a.review.ok && (
          <div className="mt-3 border-t border-line/60 pt-3">
            <ReviewBadge review={a.review} showIssues />
          </div>
        )}
      </div>

      {a.status === 'pending' && (
        <div className="flex items-center justify-between gap-3 border-t border-line/60 bg-neutral-50/50 px-4 py-3">
          <p className="text-xs text-ink-faint">Estimated from part catalog · above auto-send threshold</p>
          <div className="flex gap-2">
            <Btn
              variant="outline"
              disabled={sending}
              onClick={reject}
              className="hover:border-accent-100 hover:bg-accent-50 hover:text-accent-700"
            >
              <X size={15} /> Reject
            </Btn>
            <Btn variant="success" disabled={sending} onClick={approve}>
              {sending ? (
                <>
                  <LoaderCircle size={15} className="animate-spin" /> Sending…
                </>
              ) : (
                <>
                  <Send size={15} /> Approve & send
                </>
              )}
            </Btn>
          </div>
        </div>
      )}

      {a.status === 'sent' && (
        <div className="flex items-center gap-2.5 border-t border-line/60 bg-success-50/50 px-4 py-3">
          <CircleCheck size={17} className="animate-pop shrink-0 text-success" />
          <p className="text-sm font-medium text-success">Email sent to {a.vendor}</p>
          <p className="ml-auto text-xs text-ink-faint">Vendor confirmation expected within 24h</p>
        </div>
      )}

      {a.status === 'rejected' && (
        <div className="border-t border-line/60 px-4 py-3">
          <p className="text-xs text-ink-faint">Returned to auditor queue — no email was sent to the vendor.</p>
        </div>
      )}
    </Card>
  )
}

/**
 * Internal pull requests, shown above the vendor queue so a supervisor sees both request
 * types in one place. Deliberately visually distinct: these never involve a cost, a
 * vendor, or the approval threshold — the only decision is whether the part was actually
 * on the shelf.
 */
function PullRequestPanel({ pulls }) {
  const { t } = useI18n()
  const pending = pulls.filter((p) => p.status === 'pending_pickup')
  const recent = pulls.filter((p) => p.status !== 'pending_pickup').slice(0, 3)
  if (pulls.length === 0) return null

  return (
    <Card className="mb-6 overflow-hidden border-primary-100">
      <div className="flex flex-wrap items-center justify-between gap-3 bg-primary-50/60 p-4">
        <div className="flex items-start gap-3">
          <SoftIcon icon={Warehouse} tone="primary" />
          <div>
            <h3 className="text-sm font-semibold">{t('appr.internalSection')}</h3>
            <p className="mt-0.5 text-xs text-ink-soft">{t('appr.internalHint')}</p>
          </div>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-surface px-2.5 py-1 text-[11px] font-semibold text-primary">
          <PackageSearch size={12} /> {pending.length} {t('appr.awaitingPickup')}
        </span>
      </div>
      <div className="divide-y divide-line/60">
        {pending.map((pr) => (
          <PullRequestRow key={pr.id} pr={pr} />
        ))}
        {recent.map((pr) => (
          <PullRequestRow key={pr.id} pr={pr} />
        ))}
      </div>
    </Card>
  )
}

function ConsolidationPanel({ count }) {
  const [open, setOpen] = useState(false)
  const queryClient = useQueryClient()
  const toast = useToast()
  const { data = [], isFetching, isError, error } = useQuery({
    queryKey: ['consolidations'],
    queryFn: api.consolidations,
    enabled: open,
    staleTime: 30_000,
  })

  const approveBatch = useMutation({
    mutationFn: api.approveConsolidation,
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['partRequests'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      queryClient.invalidateQueries({ queryKey: ['consolidations'] })
      toast(
        `${res.count} requests approved — one purchase order ${res.emailed ? 'sent' : 'prepared'} for ${res.vendor}`,
        'success',
      )
    },
    onError: (e) => toast(e.message || 'Could not approve the batch', 'error'),
  })

  return (
    <Card className="mb-6 overflow-hidden border-primary-100">
      <div className="flex flex-wrap items-center justify-between gap-3 bg-primary-50/60 p-4">
        <div className="flex items-start gap-3">
          <SoftIcon icon={Layers} tone="primary" />
          <div>
            <h3 className="text-sm font-semibold">Smart procurement</h3>
            <p className="mt-0.5 text-xs text-ink-soft">
              {count} vendor{count > 1 ? 's have' : ' has'} multiple pending requests — the agent can batch each
              into a single consolidated purchase order.
            </p>
          </div>
        </div>
        {!open && (
          <Btn onClick={() => setOpen(true)}>
            <Sparkles size={15} /> Draft consolidated POs
          </Btn>
        )}
      </div>

      {open && (
        <div className="border-t border-line/60 p-4">
          {isFetching && (
            <div className="flex items-center gap-2 py-4 text-sm text-ink-faint">
              <LoaderCircle size={16} className="animate-spin text-primary" /> Drafting consolidated purchase
              orders on the local model…
            </div>
          )}
          {isError && (
            <p className="py-3 text-sm text-accent-700">
              Couldn't draft consolidations: {error?.message ?? 'try again in a moment.'}
            </p>
          )}
          {!isFetching && !isError && data.length === 0 && (
            <p className="py-3 text-sm text-ink-faint">Nothing to consolidate right now.</p>
          )}
          <div className="space-y-4">
            {data.map((c) => (
              <div key={c.vendorId} className="rounded-lg border border-line/70 bg-neutral-50 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <PackageCheck size={16} className="text-primary" />
                    <span className="text-sm font-semibold">{c.vendor}</span>
                    <span className="rounded-full bg-primary-50 px-2 py-0.5 text-[11px] font-semibold text-primary">
                      {c.count} items · {c.codes.join(', ')}
                    </span>
                  </div>
                  <span className="readout text-sm font-bold">{fmtIDR(c.totalCost)}</span>
                </div>
                <div className="mt-3 rounded-lg border border-line/70 bg-surface p-3.5">
                  <div className="space-y-0.5 text-xs text-ink-faint">
                    <p>From: SmartPM &lt;pm-bot@ptmi.co.id&gt;</p>
                    <p>To: {c.vendorEmail} ({c.vendor})</p>
                  </div>
                  <p className="mt-2 text-[13px] font-semibold text-ink">{c.subject}</p>
                  <div className="my-2.5 border-t border-line/60" />
                  <p className="whitespace-pre-line text-[13px] leading-relaxed text-ink-soft">{c.body}</p>
                </div>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[11px] text-ink-faint">
                    Approving sends <b>one</b> email covering {c.count} requests, instead of {c.count}{' '}
                    separate ones.
                  </p>
                  <Btn
                    variant="success"
                    disabled={approveBatch.isPending}
                    onClick={() =>
                      approveBatch.mutate({
                        vendorId: c.vendorId,
                        codes: c.codes,
                        subject: c.subject,
                        body: c.body,
                      })
                    }
                  >
                    {approveBatch.isPending && approveBatch.variables?.vendorId === c.vendorId ? (
                      <>
                        <LoaderCircle size={15} className="animate-spin" /> Sending…
                      </>
                    ) : (
                      <>
                        <Send size={15} /> Approve all {c.count} &amp; send as one PO
                      </>
                    )}
                  </Btn>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  )
}
