import { useQuery } from '@tanstack/react-query'
import {
  ArrowRight, CircleCheck, ClipboardCheck, MailCheck, Plus, TriangleAlert,
} from 'lucide-react'
import { Btn, Card, ScreenHeader, SeverityChip, SoftIcon, StatusBadge } from '../components/ui'
import { BarRows, ChartLegend, DonutChart, Gauge, TrendChart } from '../components/charts'
import PlantMap from '../components/PlantMap'
import { iconForMachine } from '../components/machineIcons'
import { VerificationSummaryBadge } from '../components/VerificationBadge'
import { fmtIDR } from '../data'
import { api } from '../lib/api'
import { useI18n } from '../lib/i18n'

export default function Dashboard({ sheets, findings, approvals, trend = [], go }) {
  const { t, tv } = useI18n()
  // Read-only, and shares the React Query cache with the Checksheet screen. Needed for the
  // floor map's real PM due state so "overdue" is a fact rather than a decoration.
  const { data: machines = [] } = useQuery({ queryKey: ['machines'], queryFn: api.machines })

  const today = sheets.filter((s) => s.date.startsWith('Today')).length
  const pending = approvals.filter((a) => a.status === 'pending')
  const pendingTotal = pending.reduce((n, a) => n + a.cost, 0)
  const high = findings.filter((f) => f.severity === 'High').length

  const statusData = [
    { label: t('dash.complete'), value: sheets.filter((s) => s.status === 'Complete').length, color: 'var(--color-success)' },
    { label: t('dash.flagged'), value: sheets.filter((s) => s.status === 'Flagged').length, color: 'var(--color-accent)' },
    { label: t('dash.pendingApproval'), value: sheets.filter((s) => s.status === 'Pending Approval').length, color: 'var(--color-primary)' },
  ]
  const severityData = [
    { label: t('dash.high'), value: findings.filter((f) => f.severity === 'High').length, color: '#e97132' },
    { label: t('dash.medium'), value: findings.filter((f) => f.severity === 'Medium').length, color: '#f0b27a' },
    { label: t('dash.low'), value: findings.filter((f) => f.severity === 'Low').length, color: '#b5d0df' },
  ]

  const stats = [
    { label: t('dash.checksheetsToday'), value: today, sub: t('dash.ofScheduled'), icon: ClipboardCheck, tone: 'primary' },
    { label: t('dash.openFindings'), value: findings.length, sub: `${high} ${t('dash.highPriority')}`, icon: TriangleAlert, tone: 'accent', subCls: high ? 'text-accent-700' : '' },
    { label: t('dash.pendingApprovals'), value: pending.length, sub: pending.length ? `${fmtIDR(pendingTotal)} ${t('dash.estimated')}` : t('dash.allClear'), icon: MailCheck, tone: 'neutral' },
  ]

  // Share of part requests that have been actioned rather than left sitting in the queue.
  const handled = approvals.filter((a) => a.status !== 'pending').length
  const approvalRate = approvals.length ? Math.round((handled / approvals.length) * 100) : 100
  const rateColor = (n) =>
    n >= 90 ? 'var(--color-signal-green)' : n >= 70 ? 'var(--color-primary)' : 'var(--color-signal-amber)'

  return (
    <>
      <ScreenHeader title={t('dash.title')} sub={t('dash.sub')}>
        <Btn onClick={() => go('checksheet')}>
          <Plus size={16} /> {t('dash.newChecksheet')}
        </Btn>
      </ScreenHeader>

      <PlantMap machines={machines} findings={findings} approvals={approvals} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label} className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[13px] font-medium text-ink-soft">{s.label}</p>
                <p className="readout mt-1 text-3xl font-semibold tracking-tight">{s.value}</p>
                <p className={`mt-1 text-xs font-medium ${s.subCls || 'text-ink-faint'}`}>{s.sub}</p>
              </div>
              <SoftIcon icon={s.icon} tone={s.tone} />
            </div>
          </Card>
        ))}

        {/* Rate metrics read as instrument dials rather than bare percentages. */}
        <Card className="flex items-center justify-around gap-2 p-4 sm:col-span-2 xl:col-span-1">
          <Gauge value={94} caption={t('dash.compliance')} color={rateColor(94)} />
          <Gauge value={approvalRate} caption={t('dash.approved')} color={rateColor(approvalRate)} />
        </Card>
      </div>

      {/* Trend — the only widget on this page with a time dimension. */}
      <Card className="mt-4 p-4">
        <h2 className="text-[15px] font-semibold">{t('dash.trend')}</h2>
        <div className="mt-3">
          {trend.length ? (
            <TrendChart
              data={trend}
              labels={{ title: t('dash.trend'), total: t('dash.colFindings'), high: t('dash.high') }}
            />
          ) : (
            <p className="py-6 text-center text-xs text-ink-faint">{t('dash.trendEmpty')}</p>
          )}
        </div>
      </Card>

      {/* Charts */}
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Card className="p-4">
          <h2 className="text-[15px] font-semibold">{t('dash.outcomes')}</h2>
          <div className="mt-3 flex items-center gap-5">
            <DonutChart data={statusData} />
            <div className="min-w-0 flex-1">
              <ChartLegend data={statusData} />
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <h2 className="text-[15px] font-semibold">{t('dash.bySeverity')}</h2>
          <div className="mt-4">
            <BarRows data={severityData} />
          </div>
        </Card>
      </div>

      <div className="mt-6 grid items-start gap-6 lg:grid-cols-3">
        {/* Recent checksheets */}
        <Card className="lg:col-span-2">
          <div className="flex items-center justify-between border-b border-line/70 px-4 py-4">
            <h2 className="text-[15px] font-semibold">{t('dash.recent')}</h2>
            <span className="text-xs text-ink-faint">{t('dash.lastDays')} · {sheets.length} {t('dash.records')}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line/70 text-left text-[11px] font-semibold uppercase tracking-wider text-ink-faint">
                  <th className="px-4 py-2.5">{t('dash.colChecksheet')}</th>
                  <th className="px-4 py-2.5">{t('dash.colTechnician')}</th>
                  <th className="px-4 py-2.5">{t('dash.colDate')}</th>
                  <th className="px-4 py-2.5">{t('dash.colFindings')}</th>
                  <th className="px-4 py-2.5">{t('dash.colStatus')}</th>
                </tr>
              </thead>
              <tbody>
                {sheets.map((s) => {
                  const MachineIcon = iconForMachine(s.machine)
                  return (
                  <tr key={s.id} className="border-b border-line/50 transition-colors last:border-0 hover:bg-neutral-50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="grid size-8 shrink-0 place-items-center rounded-md border border-line bg-neutral-50 text-ink-soft">
                          <MachineIcon size={18} title={s.machine} />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 text-[13px] font-semibold">
                            <span className="readout">{s.id}</span>
                            {s.generated && (
                              <span className="rounded-full bg-primary-50 px-1.5 py-px text-[10px] font-bold text-primary">NEW</span>
                            )}
                          </div>
                          <div className="truncate text-xs text-ink-faint">{s.machine}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-[13px] font-medium">{s.tech}</div>
                      <div className="text-xs text-ink-faint">{s.vendor}</div>
                    </td>
                    <td className="readout whitespace-nowrap px-4 py-3 text-xs text-ink-soft">{s.date}</td>
                    <td className="px-4 py-3">
                      {s.findings ? (
                        <span className="inline-flex items-center gap-1 text-[13px] font-semibold text-accent-700">
                          <TriangleAlert size={13} /> {s.findings}
                        </span>
                      ) : (
                        <span className="text-ink-faint">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col items-start gap-1">
                        <StatusBadge status={s.status} />
                        <VerificationSummaryBadge summary={s.verification} />
                      </div>
                    </td>
                  </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Right rail */}
        <div className="space-y-6">
          <Card className="p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-[15px] font-semibold">{t('dash.openFindings')}</h2>
              <span className="rounded-full bg-accent-50 px-2 py-0.5 text-[11px] font-semibold text-accent-700">
                {findings.length}
              </span>
            </div>
            <ul className="mt-1 divide-y divide-line/60">
              {findings.map((f) => (
                <li key={f.id} className="flex items-start justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-medium">{tv('cat', f.title)}</p>
                    <p className="mt-0.5 truncate text-xs text-ink-faint">
                      {f.machine} · {f.sheet} · {f.when}
                    </p>
                  </div>
                  <SeverityChip level={f.severity} />
                </li>
              ))}
            </ul>
          </Card>

          <Card className="p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-[15px] font-semibold">{t('dash.approvalQueue')}</h2>
              <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-semibold text-neutral-500">
                {pending.length}
              </span>
            </div>
            {pending.length ? (
              <ul className="mt-1 divide-y divide-line/60">
                {pending.map((a) => (
                  <li key={a.id} className="flex items-start justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-medium">{a.part}</p>
                      <p className="mt-0.5 truncate text-xs text-ink-faint">
                        {a.machine} · {a.id}
                      </p>
                    </div>
                    <span className="readout shrink-0 text-[13px] font-semibold">{fmtIDR(a.cost)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 flex items-center gap-1.5 text-[13px] text-success">
                <CircleCheck size={15} /> {t('dash.caughtUp')}
              </p>
            )}
            <Btn variant="ghost" className="mt-2 w-full text-primary hover:bg-primary-50 hover:text-primary" onClick={() => go('approvals')}>
              {t('dash.reviewApprovals')} <ArrowRight size={15} />
            </Btn>
          </Card>
        </div>
      </div>
    </>
  )
}
