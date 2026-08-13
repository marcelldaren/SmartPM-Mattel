import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowRight, CalendarCheck, CalendarClock, Check, History, LoaderCircle, Sparkles, X,
} from 'lucide-react'
import { Btn, Card } from './ui'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import { useToast } from '../lib/toast'

/**
 * Scheduling proposals from the predictive-PM agent, in the same approve/dismiss shape as
 * the part-request queue.
 *
 * Approving writes the machine's real next-PM date; dismissing changes nothing but the
 * proposal's own status. Both are supervisor-only, matching the part-request gate.
 */

const fmtDate = (iso) =>
  iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'

export default function PmRecommendations() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const toast = useToast()
  const isSupervisor = user.role === 'supervisor'

  const { data, isLoading } = useQuery({ queryKey: ['pmRecommendations'], queryFn: api.pmRecommendations })
  const recommendations = data?.recommendations ?? []
  const changes = data?.changes ?? []
  const pending = recommendations.filter((r) => r.status === 'pending')

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['pmRecommendations'] })
    queryClient.invalidateQueries({ queryKey: ['machines'] })
    queryClient.invalidateQueries({ queryKey: ['dashboard'] })
  }

  const generate = useMutation({
    mutationFn: api.generatePmRecommendations,
    onSuccess: (res) => {
      invalidate()
      toast(
        res.created
          ? `${res.created} scheduling recommendation${res.created > 1 ? 's' : ''} proposed`
          : 'No new scheduling recommendations — nothing qualifies right now',
        res.created ? 'success' : 'info',
      )
    },
    onError: (e) => toast(e.message || 'Could not generate recommendations', 'error'),
  })

  const approve = useMutation({
    mutationFn: api.approvePmRecommendation,
    onSuccess: (rec) => {
      invalidate()
      toast(`PM moved to ${fmtDate(rec.suggestedDueDate)} for ${rec.machine}`, 'success')
    },
    onError: (e) => toast(e.message || 'Could not approve', 'error'),
  })

  const dismiss = useMutation({
    mutationFn: api.dismissPmRecommendation,
    onSuccess: () => {
      invalidate()
      toast('Recommendation dismissed — schedule unchanged', 'info')
    },
    onError: (e) => toast(e.message || 'Could not dismiss', 'error'),
  })

  const busy = generate.isPending || approve.isPending || dismiss.isPending

  return (
    <Card className="mb-4 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line/70 px-4 py-3.5">
        <div className="flex items-center gap-2.5">
          <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary-50">
            <CalendarClock size={17} className="text-primary" />
          </div>
          <div>
            <h2 className="text-[15px] font-semibold">Scheduling recommendations</h2>
            <p className="text-xs text-ink-faint">
              {pending.length
                ? `${pending.length} proposal${pending.length > 1 ? 's' : ''} awaiting a decision`
                : 'Proposals to bring a machine’s next PM forward, based on its failure interval'}
            </p>
          </div>
        </div>
        {isSupervisor && (
          <Btn variant="outline" onClick={() => generate.mutate()} disabled={busy}>
            {generate.isPending ? (
              <>
                <LoaderCircle size={15} className="animate-spin" /> Analyzing…
              </>
            ) : (
              <>
                <Sparkles size={15} /> Propose changes
              </>
            )}
          </Btn>
        )}
      </div>

      {isLoading && (
        <div className="grid place-items-center py-10">
          <LoaderCircle size={20} className="animate-spin text-primary" />
        </div>
      )}

      {!isLoading && pending.length === 0 && (
        <p className="px-4 py-6 text-center text-xs text-ink-faint">
          No proposals waiting.{' '}
          {isSupervisor
            ? 'Run “Propose changes” after new findings come in.'
            : 'A supervisor can generate these.'}
        </p>
      )}

      {pending.map((r) => (
        <div key={r.id} className="animate-rise border-b border-line/60 px-4 py-4 last:border-0">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-semibold">{r.machine}</h3>
                <span className="readout rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] text-ink-soft">
                  {r.machineCode}
                </span>
                <span className="rounded-full bg-accent-50 px-2 py-0.5 text-[11px] font-semibold text-accent-700">
                  {r.daysEarlier} day{r.daysEarlier === 1 ? '' : 's'} earlier
                </span>
              </div>
              <p className="mt-0.5 text-xs text-ink-faint">
                {r.itemLabel} · failed {r.occurrences}×
              </p>
            </div>
            <div className="readout shrink-0 text-right text-[13px]">
              <div className="flex items-center gap-2">
                <span className="text-ink-faint line-through">{fmtDate(r.currentDueDate)}</span>
                <ArrowRight size={13} className="text-ink-faint" />
                <span className="font-semibold text-primary">{fmtDate(r.suggestedDueDate)}</span>
              </div>
              <p className="mt-0.5 text-[11px] text-ink-faint">
                every {r.currentIntervalDays}d → every {r.suggestedIntervalDays}d
              </p>
            </div>
          </div>

          <div className="mt-3 rounded-lg border border-line/70 bg-neutral-50 p-3">
            <p className="text-[13px] font-semibold text-ink">{r.action}</p>
            <p className="mt-1 text-xs leading-relaxed text-ink-soft">{r.rationale}</p>
            {/* Node's own arithmetic, shown verbatim — the supervisor can check the
                number without taking the model's word for it. */}
            <p className="mt-2 border-t border-line/60 pt-2 text-[11px] leading-relaxed text-ink-faint">
              <span className="font-semibold">How this date was calculated: </span>
              {r.basis}
            </p>
          </div>

          {isSupervisor && (
            <div className="mt-3 flex items-center justify-end gap-2">
              <Btn variant="outline" onClick={() => dismiss.mutate(r.id)} disabled={busy}>
                <X size={15} /> Dismiss
              </Btn>
              <Btn variant="success" onClick={() => approve.mutate(r.id)} disabled={busy}>
                {approve.isPending && approve.variables === r.id ? (
                  <>
                    <LoaderCircle size={15} className="animate-spin" /> Applying…
                  </>
                ) : (
                  <>
                    <CalendarCheck size={15} /> Approve &amp; reschedule
                  </>
                )}
              </Btn>
            </div>
          )}
        </div>
      ))}

      {changes.length > 0 && (
        <div className="border-t border-line/70 bg-neutral-50/60 px-4 py-3">
          <p className="readout mb-1.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
            Schedule change log
          </p>
          <ul className="space-y-1">
            {changes.slice(0, 4).map((c) => (
              <li key={c.id} className="flex items-center gap-2 text-[11px] text-ink-soft">
                <History size={11} className="shrink-0 text-ink-faint" />
                <span className="min-w-0 truncate">
                  <b>{c.machine}</b> next PM {fmtDate(c.previousDueDate)} → {fmtDate(c.newDueDate)}
                  {c.changedBy ? ` · by ${c.changedBy}` : ''}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  )
}
