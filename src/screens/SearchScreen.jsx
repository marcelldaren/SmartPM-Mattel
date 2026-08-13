import { useEffect, useRef, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { ChevronRight, LoaderCircle, Quote, Search, Sparkles, TriangleAlert } from 'lucide-react'
import { Btn, Card, ScreenHeader, StatusBadge } from '../components/ui'
import { iconForMachine } from '../components/machineIcons'
import { EmptyState, SearchArt } from '../components/EmptyState'
import { SEARCH_PHASES, SEARCH_SUGGESTIONS } from '../data'
import { api } from '../lib/api'
import { useI18n } from '../lib/i18n'

export default function SearchScreen() {
  const { t } = useI18n()
  const [q, setQ] = useState('')
  const [submittedQuery, setSubmittedQuery] = useState('')
  const [step, setStep] = useState(0)
  const stepTimer = useRef(null)

  const searchMutation = useMutation({
    mutationFn: (query) => api.search(query),
  })

  useEffect(() => {
    if (searchMutation.isPending) {
      setStep(0)
      stepTimer.current = setInterval(() => {
        setStep((s) => Math.min(s + 1, SEARCH_PHASES.length - 1))
      }, 900)
    } else if (stepTimer.current) {
      clearInterval(stepTimer.current)
    }
    return () => clearInterval(stepTimer.current)
  }, [searchMutation.isPending])

  const run = (query) => {
    const text = query.trim()
    if (!text || searchMutation.isPending) return
    setQ(query)
    setSubmittedQuery(text)
    searchMutation.mutate(text)
  }

  const phase = searchMutation.isPending ? 'loading' : searchMutation.isSuccess ? 'done' : searchMutation.isError ? 'error' : 'idle'
  const result = searchMutation.data

  return (
    <>
      <ScreenHeader title={t('search.title')} sub={t('search.sub')} />

      <form
        onSubmit={(e) => {
          e.preventDefault()
          run(q)
        }}
      >
        <div className="flex items-center gap-3 rounded-lg border border-line bg-surface px-4 py-2.5 shadow-xs transition-all focus-within:border-primary focus-within:ring-4 focus-within:ring-primary/10">
          <Sparkles size={18} className="shrink-0 text-primary" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            disabled={phase === 'loading'}
            placeholder={t('search.placeholder')}
            className="h-9 min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-ink-faint"
          />
          <Btn type="submit" disabled={phase === 'loading' || !q.trim()}>
            <Search size={15} /> {t('search.button')}
          </Btn>
        </div>
      </form>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-xs text-ink-faint">{t('search.try')}</span>
        {SEARCH_SUGGESTIONS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => run(s)}
            className="cursor-pointer rounded-full border border-line bg-surface px-3 py-1.5 text-xs font-medium text-ink-soft transition-colors hover:border-primary-200 hover:text-primary"
          >
            {s}
          </button>
        ))}
      </div>

      {phase === 'idle' && (
        <Card className="mt-6 p-10">
          <EmptyState
            art={SearchArt}
            title={t('search.emptyTitle')}
            body={t('search.emptyBody')}
          />
        </Card>
      )}

      {phase === 'loading' && (
        <Card className="mt-6 p-10 text-center">
          <LoaderCircle size={24} className="mx-auto animate-spin text-primary" />
          <p className="mt-4 text-sm font-medium">{SEARCH_PHASES[step]}</p>
          <p className="mt-1 text-xs text-ink-faint">{t('search.slowNote')}</p>
        </Card>
      )}

      {phase === 'error' && (
        <Card className="mt-6 p-10 text-center">
          <TriangleAlert size={22} className="mx-auto text-accent" />
          <p className="mt-3 text-sm font-medium">{t('search.failed')}</p>
          <p className="mt-1 text-xs text-ink-faint">{searchMutation.error?.message ?? t('common.retry')}</p>
        </Card>
      )}

      {phase === 'done' && result && (
        <div className="mt-6 space-y-3">
          <div className="animate-rise flex items-start gap-3 rounded-lg border border-primary-100 bg-primary-50 p-4">
            <Sparkles size={16} className="mt-0.5 shrink-0 text-primary" />
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-primary">{t('search.aiSummary')}</p>
              <p className="mt-1 text-sm leading-relaxed text-ink">{result.summary}</p>
            </div>
          </div>

          <p className="pt-1 text-xs text-ink-faint">
            {result.results.length} {t('search.matching')} "{submittedQuery}"
          </p>

          {result.results.map((r, i) => {
            const MachineIcon = iconForMachine(r.machine)
            return (
            <Card
              key={r.sheet}
              className="animate-rise group cursor-default p-4 transition-all hover:border-primary-200 hover:shadow-sm"
              style={{ animationDelay: `${i * 80}ms` }}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2.5">
                  <div className="grid size-8 shrink-0 place-items-center rounded-md border border-line bg-neutral-50 text-ink-soft">
                    <MachineIcon size={18} title={r.machine} />
                  </div>
                  <span className="readout text-sm font-semibold">{r.sheet}</span>
                  <StatusBadge status={r.status} />
                </div>
                <div className="flex shrink-0 items-center gap-2 text-xs text-ink-faint">
                  <span className="readout">{r.date}</span>
                  <ChevronRight size={15} />
                </div>
              </div>
              <p className="mt-2.5 text-sm font-medium">{r.finding}</p>
              <p className="mt-0.5 text-xs text-ink-faint">
                {r.machine} · {r.tech}
              </p>
              <div className="mt-3 flex items-start gap-1.5 border-t border-line/60 pt-3 text-xs">
                <Quote size={11} className="mt-0.5 shrink-0 text-ink-faint" />
                <p className="text-ink-soft">
                  <span className="font-semibold">{t('search.whyMatched')} </span>
                  {r.reason}
                </p>
              </div>
            </Card>
            )
          })}
        </div>
      )}
    </>
  )
}
