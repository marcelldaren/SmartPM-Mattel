import { useQuery } from '@tanstack/react-query'
import {
  Activity, CalendarClock, LoaderCircle, RefreshCw, Sparkles, TrendingUp, TriangleAlert,
} from 'lucide-react'
import { Btn, Card, ScreenHeader } from '../components/ui'
import PmRecommendations from '../components/PmRecommendations'
import { api } from '../lib/api'
import { useI18n } from '../lib/i18n'

function UrgencyChip({ level }) {
  const { t } = useI18n()
  const styles =
    level === 'High'
      ? 'bg-accent text-white'
      : 'bg-accent-50 text-accent-700'
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${styles}`}>{level} {t('pm.priority')}</span>
}

export default function InsightsScreen() {
  const { t } = useI18n()
  const { data, isLoading, isFetching, refetch, isError, error } = useQuery({
    queryKey: ['insights'],
    queryFn: api.insights,
    staleTime: 60_000,
  })

  const stats = data?.stats ?? []
  const recs = data?.recommendations ?? []

  return (
    <>
      <ScreenHeader
        title={t('pm.title')}
        sub={t('pm.sub')}
      >
        <Btn variant="outline" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw size={15} className={isFetching ? 'animate-spin' : ''} /> {t('pm.reanalyze')}
        </Btn>
      </ScreenHeader>

      {/* Approvable scheduling proposals built on the same detection below. */}
      <PmRecommendations />

      {isLoading && (
        <Card className="p-10 text-center">
          <LoaderCircle size={24} className="mx-auto animate-spin text-primary" />
          <p className="mt-4 text-sm font-medium">{t('pm.analyzing')}</p>
          <p className="mt-1 text-xs text-ink-faint">Running on the local model — this can take several seconds</p>
        </Card>
      )}

      {isError && (
        <Card className="p-10 text-center">
          <TriangleAlert size={22} className="mx-auto text-accent" />
          <p className="mt-3 text-sm font-medium">Couldn't generate insights</p>
          <p className="mt-1 text-xs text-ink-faint">{error?.message ?? 'Try again in a moment.'}</p>
        </Card>
      )}

      {!isLoading && !isError && stats.length === 0 && (
        <Card className="animate-rise p-10 text-center">
          <div className="mx-auto grid size-11 place-items-center rounded-full bg-success-50">
            <Activity size={19} className="text-success" />
          </div>
          <p className="mt-4 text-sm font-medium">{t('pm.nothingTitle')}</p>
          <p className="mx-auto mt-1.5 max-w-sm text-xs leading-relaxed text-ink-faint">
            No inspection point has failed more than once. As checksheets accumulate, repeat failures surface
            here with a recommended predictive-maintenance action.
          </p>
        </Card>
      )}

      {!isLoading && !isError && stats.length > 0 && (
        <div className="space-y-3">
          {data?.summary && (
            <div className="animate-rise flex items-start gap-3 rounded-lg border border-primary-100 bg-primary-50 p-4">
              <Sparkles size={16} className="mt-0.5 shrink-0 text-primary" />
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-primary">{t('pm.summary')}</p>
                <p className="mt-1 text-sm leading-relaxed text-ink">{data.summary}</p>
              </div>
            </div>
          )}

          <p className="pt-1 text-xs text-ink-faint">
            {recs.length} recurring inspection point{recs.length === 1 ? '' : 's'} · ranked by occurrence count
          </p>

          {recs.map((r, i) => {
            const stat = stats.find((s) => s.machine === r.machine && s.item === r.item)
            return (
              <Card
                key={`${r.machine}-${r.item}`}
                className="animate-rise p-4 transition-all hover:border-primary-200 hover:shadow-sm"
                style={{ animationDelay: `${i * 70}ms` }}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-accent-50">
                      <TrendingUp size={17} className="text-accent-700" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-sm font-semibold">{r.machine}</h3>
                        <UrgencyChip level={r.urgency} />
                      </div>
                      <p className="mt-0.5 text-xs text-ink-faint">
                        {r.item}
                        {stat ? ` · ${stat.category}` : ''}
                      </p>
                    </div>
                  </div>
                  {stat && (
                    <div className="shrink-0 text-right">
                      <p className="readout text-lg font-bold text-accent-700">{stat.occurrences}×</p>
                      <p className="text-[11px] text-ink-faint">last {stat.lastSeen}</p>
                    </div>
                  )}
                </div>

                <div className="mt-3 rounded-lg border border-line/70 bg-neutral-50 p-3">
                  <p className="text-[13px] font-semibold text-ink">{r.action}</p>
                  <p className="mt-1 text-xs leading-relaxed text-ink-soft">{r.rationale}</p>
                  {stat && (
                    <p className="mt-2 flex items-center gap-1.5 text-[11px] text-ink-faint">
                      <CalendarClock size={12} /> PM interval: {stat.pmIntervalLabel} · last PM {stat.lastPmDate}
                    </p>
                  )}
                </div>
              </Card>
            )
          })}
        </div>
      )}
    </>
  )
}
