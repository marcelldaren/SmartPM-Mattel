import { useMutation } from '@tanstack/react-query'
import {
  ClipboardList, FileText, LoaderCircle, Lightbulb, Sparkles, TriangleAlert,
} from 'lucide-react'
import { Btn, Card, ScreenHeader } from '../components/ui'
import { fmtIDR } from '../data'
import { api } from '../lib/api'
import { useToast } from '../lib/toast'

function Stat({ label, value, tone = 'ink' }) {
  const toneCls = { ink: 'text-ink', accent: 'text-accent-700', success: 'text-success', primary: 'text-primary' }[tone]
  return (
    <div className="rounded-lg border border-line/70 bg-surface p-3">
      <p className={`readout text-xl font-bold ${toneCls}`}>{value}</p>
      <p className="mt-0.5 text-[11px] leading-tight text-ink-faint">{label}</p>
    </div>
  )
}

export default function ReportsScreen() {
  const toast = useToast()
  const gen = useMutation({
    mutationFn: api.report,
    onError: (e) => toast(e.message || 'Report generation failed', 'error'),
    onSuccess: () => toast('Shift report generated', 'success'),
  })
  const r = gen.data
  const d = r?.data

  return (
    <>
      <ScreenHeader
        title="Shift Report"
        sub="A one-click executive PM summary the AI writes from today's real plant data."
      >
        <Btn onClick={() => gen.mutate()} disabled={gen.isPending}>
          {gen.isPending ? (
            <>
              <LoaderCircle size={15} className="animate-spin" /> Generating…
            </>
          ) : (
            <>
              <Sparkles size={15} /> {r ? 'Regenerate' : 'Generate report'}
            </>
          )}
        </Btn>
      </ScreenHeader>

      {!r && !gen.isPending && !gen.isError && (
        <Card className="p-10 text-center">
          <div className="mx-auto grid size-11 place-items-center rounded-full bg-primary-50">
            <ClipboardList size={19} className="text-primary" />
          </div>
          <p className="mt-4 text-sm font-medium">No report yet</p>
          <p className="mx-auto mt-1.5 max-w-sm text-xs leading-relaxed text-ink-faint">
            Click <span className="font-medium text-ink">Generate report</span> — the AI aggregates today's
            checksheets, findings, recurring issues, and pending approvals into a shift summary for management.
          </p>
        </Card>
      )}

      {gen.isPending && (
        <Card className="p-10 text-center">
          <LoaderCircle size={24} className="mx-auto animate-spin text-primary" />
          <p className="mt-4 text-sm font-medium">Compiling the shift report…</p>
          <p className="mt-1 text-xs text-ink-faint">Aggregating plant data, then writing on the active model</p>
        </Card>
      )}

      {gen.isError && (
        <Card className="p-10 text-center">
          <TriangleAlert size={22} className="mx-auto text-accent" />
          <p className="mt-3 text-sm font-medium">Couldn't generate the report</p>
          <p className="mt-1 text-xs text-ink-faint">{gen.error?.message ?? 'Try again in a moment.'}</p>
        </Card>
      )}

      {r && d && (
        <div className="space-y-4">
          {/* Deterministic stat grid */}
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            <Stat label="Checksheets today" value={d.checksheetsToday} tone="primary" />
            <Stat label="Findings on record" value={d.totalFindings} />
            <Stat label="High severity" value={d.highSeverity} tone="accent" />
            <Stat label="Recurring points" value={d.recurringCount} tone="accent" />
            <Stat label="Completed today" value={d.complete} tone="success" />
            <Stat label="Flagged today" value={d.flagged} tone="accent" />
            <Stat label="Awaiting approval" value={d.pendingRequests} />
            <Stat label="Pending value" value={fmtIDR(d.pendingCostIdr)} />
          </div>

          {/* AI narrative */}
          <Card className="animate-rise overflow-hidden">
            <div className="flex items-center gap-2 border-b border-line/60 bg-primary-50/60 px-5 py-3">
              <FileText size={16} className="text-primary" />
              <h2 className="text-sm font-bold">{r.headline}</h2>
              <span className="ml-auto text-[11px] text-ink-faint">
                {new Date(r.generatedAt).toLocaleString()}
              </span>
            </div>
            <div className="space-y-4 p-5">
              <p className="text-sm leading-relaxed text-ink">{r.summary}</p>

              {r.highlights?.length > 0 && (
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-faint">Highlights</p>
                  <ul className="mt-2 space-y-1.5">
                    {r.highlights.map((h, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-ink-soft">
                        <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" />
                        {h}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {r.recommendation && (
                <div className="flex items-start gap-2.5 rounded-lg border border-accent-100 bg-accent-50 p-3.5">
                  <Lightbulb size={16} className="mt-0.5 shrink-0 text-accent-700" />
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-accent-700">
                      Recommended next action
                    </p>
                    <p className="mt-1 text-sm text-ink">{r.recommendation}</p>
                  </div>
                </div>
              )}
            </div>
          </Card>

          <p className="text-center text-[11px] text-ink-faint">
            Numbers are computed directly from the database; the narrative is AI-written from those numbers.
          </p>
        </div>
      )}
    </>
  )
}
