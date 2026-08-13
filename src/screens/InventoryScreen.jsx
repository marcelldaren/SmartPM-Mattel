import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Boxes, LoaderCircle, MapPin, PackageCheck, PackageSearch, Search, TriangleAlert, X,
} from 'lucide-react'
import { Btn, Card, ScreenHeader, SoftIcon } from '../components/ui'
import { EmptyState, SearchArt } from '../components/EmptyState'
import { StockBar, StockChip } from '../components/StockLevel'
import { iconForMachine } from '../components/machineIcons'
import { fmtIDR } from '../data'
import { api } from '../lib/api'
import { useI18n } from '../lib/i18n'
import { useToast } from '../lib/toast'

export default function InventoryScreen() {
  const { t, tv } = useI18n()
  const [query, setQuery] = useState('')
  const [levelFilter, setLevelFilter] = useState('all')

  const { data, isLoading } = useQuery({ queryKey: ['inventory'], queryFn: api.inventory })
  const { data: pulls = [] } = useQuery({ queryKey: ['pullRequests'], queryFn: api.pullRequests })

  const parts = data?.parts ?? []
  const summary = data?.summary ?? { tracked: 0, low: 0, out: 0, needsRecount: 0 }
  const pendingPulls = pulls.filter((p) => p.status === 'pending_pickup')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return parts.filter((p) => {
      if (levelFilter !== 'all' && p.level !== levelFilter) return false
      if (!q) return true
      return (
        p.partName.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        (p.machineName ?? '').toLowerCase().includes(q) ||
        (p.machineCode ?? '').toLowerCase().includes(q) ||
        p.binLocation.toLowerCase().includes(q)
      )
    })
  }, [parts, query, levelFilter])

  return (
    <>
      <ScreenHeader title={t('inv.title')} sub={t('inv.sub')} />

      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label={t('inv.tracked')} value={summary.tracked} icon={Boxes} tone="primary" />
        <StatTile label={t('inv.lowStock')} value={summary.low} icon={TriangleAlert} tone="accent" />
        <StatTile label={t('inv.outOfStock')} value={summary.out} icon={X} tone="danger" />
        <StatTile label={t('inv.pendingPickup')} value={pendingPulls.length} icon={PackageCheck} tone="success" />
      </div>

      {pendingPulls.length > 0 && <PendingPickups pulls={pendingPulls} />}

      <Card className="mb-5 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('inv.searchPlaceholder')}
              className="h-10 w-full rounded-lg border border-line bg-surface pl-9 pr-3 text-sm outline-none transition-colors placeholder:text-ink-faint hover:border-neutral-400/60 focus:border-primary focus:ring-2 focus:ring-primary/15"
            />
          </div>
          <div className="flex gap-1 rounded-lg border border-line bg-neutral-50 p-0.5">
            {['all', 'healthy', 'low', 'out'].map((lvl) => (
              <button
                key={lvl}
                type="button"
                onClick={() => setLevelFilter(lvl)}
                className={`h-8 cursor-pointer rounded-md px-3 text-[13px] font-medium transition-colors ${
                  levelFilter === lvl ? 'bg-primary text-white' : 'text-ink-faint hover:bg-surface hover:text-ink'
                }`}
              >
                {lvl === 'all' ? t('inv.all') : t(`inv.level.${lvl}`)}
              </button>
            ))}
          </div>
        </div>
      </Card>

      {isLoading && (
        <div className="grid place-items-center py-16">
          <LoaderCircle size={22} className="animate-spin text-primary" />
        </div>
      )}

      {!isLoading && filtered.length === 0 && (
        <Card className="p-8">
          <EmptyState art={SearchArt} title={t('inv.emptyTitle')} body={t('inv.emptyBody')} />
        </Card>
      )}

      <div className="grid gap-3 lg:grid-cols-2">
        {filtered.map((p) => (
          <PartCard key={p.id} p={p} tv={tv} t={t} />
        ))}
      </div>
    </>
  )
}

function StatTile({ label, value, icon: Icon, tone }) {
  const TONES = {
    primary: 'bg-primary-50 text-primary',
    accent: 'bg-accent-50 text-accent-700',
    danger: 'bg-signal-red/10 text-signal-red',
    success: 'bg-success-50 text-success',
  }
  return (
    <Card className="flex items-center gap-3 p-4">
      <div className={`grid size-10 shrink-0 place-items-center rounded-lg ${TONES[tone]}`}>
        <Icon size={18} />
      </div>
      <div className="min-w-0">
        <div className="readout text-xl font-bold leading-none">{value}</div>
        <div className="mt-1 truncate text-xs text-ink-faint">{label}</div>
      </div>
    </Card>
  )
}

function PartCard({ p, tv, t }) {
  const MachineIcon = iconForMachine(`${p.machineName ?? ''} ${p.machineCode ?? ''}`)
  return (
    <Card className="p-4">
      <div className="flex items-start gap-3">
        <div className="blueprint-grid grid size-11 shrink-0 place-items-center rounded-lg border border-steel-800 bg-steel-900 text-primary-200">
          {p.machineId ? <MachineIcon size={22} /> : <Boxes size={20} />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <h3 className="text-sm font-semibold leading-snug">{p.partName}</h3>
            <StockChip level={p.level} />
          </div>
          <p className="readout mt-0.5 text-[11px] text-ink-faint">{p.sku}</p>

          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-ink-soft">
            <span className="inline-flex items-center gap-1">
              <MapPin size={11} className="text-ink-faint" /> {p.binLocation}
            </span>
            <span>{p.machineName ?? t('inv.anyMachine')}</span>
            <span className="text-ink-faint">{tv('cat', p.category)}</span>
            {p.unitCostIdr != null && <span className="readout">{fmtIDR(p.unitCostIdr)}</span>}
          </div>

          <div className="mt-3">
            <div className="mb-1 flex items-baseline justify-between text-[11px]">
              <span className="readout font-semibold">
                {p.quantityOnHand}
                <span className="font-normal text-ink-faint"> / {p.maxQuantity}</span>
              </span>
              <span className="text-ink-faint">
                {t('inv.reorderAt')} {p.reorderThreshold}
                {p.reserved > 0 && ` · ${p.reserved} ${t('inv.reserved')}`}
              </span>
            </div>
            <StockBar
              quantity={p.quantityOnHand}
              max={p.maxQuantity}
              threshold={p.reorderThreshold}
              level={p.level}
              reserved={p.reserved}
            />
          </div>

          {p.needsRecount && (
            <p className="mt-2 flex items-start gap-1.5 rounded-md bg-accent-50 px-2 py-1.5 text-[11px] font-medium leading-relaxed text-accent-700">
              <TriangleAlert size={12} className="mt-px shrink-0" />
              {t('inv.needsRecount')}
              {p.recountNote ? ` — ${p.recountNote}` : ''}
            </p>
          )}
        </div>
      </div>
    </Card>
  )
}

/** Open pull requests, actionable from the inventory screen as well as Approvals. */
function PendingPickups({ pulls }) {
  const { t } = useI18n()
  return (
    <Card className="mb-5 overflow-hidden border-primary-100">
      <div className="flex items-center gap-3 bg-primary-50/60 p-4">
        <SoftIcon icon={PackageSearch} tone="primary" />
        <div>
          <h3 className="text-sm font-semibold">{t('inv.pendingTitle')}</h3>
          <p className="mt-0.5 text-xs text-ink-soft">{t('inv.pendingBody')}</p>
        </div>
      </div>
      <div className="divide-y divide-line/60">
        {pulls.map((pr) => (
          <PullRequestRow key={pr.id} pr={pr} />
        ))}
      </div>
    </Card>
  )
}

export function PullRequestRow({ pr }) {
  const { t } = useI18n()
  const queryClient = useQueryClient()
  const toast = useToast()

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['pullRequests'] })
    queryClient.invalidateQueries({ queryKey: ['inventory'] })
    queryClient.invalidateQueries({ queryKey: ['dashboard'] })
  }

  const pickup = useMutation({
    mutationFn: () => api.confirmPickup(pr.code),
    onSuccess: (r) => {
      invalidate()
      toast(`${pr.code} ${t('inv.pickedUpToast')} · ${r.partName} — ${r.quantityOnHand} ${t('inv.left')}`, 'success')
    },
    onError: (e) => toast(e.message || 'Could not confirm pickup', 'error'),
  })

  const discrepancy = useMutation({
    mutationFn: () => api.reportDiscrepancy(pr.code, null),
    onSuccess: () => {
      invalidate()
      toast(`${pr.code} — ${t('inv.discrepancyToast')}`, 'info')
    },
    onError: (e) => toast(e.message || 'Could not report discrepancy', 'error'),
  })

  const busy = pickup.isPending || discrepancy.isPending

  return (
    <div className="flex flex-wrap items-center gap-3 p-4">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="readout text-xs font-bold text-primary">{pr.code}</span>
          <h4 className="text-sm font-semibold">{pr.partName}</h4>
          <span className="rounded-full bg-primary-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary">
            {t('inv.internal')}
          </span>
        </div>
        <p className="mt-0.5 text-xs text-ink-faint">
          {pr.machine} · {pr.itemLabel} · {pr.sheet} · {pr.technician}
        </p>
        <p className="mt-1 flex flex-wrap items-center gap-x-3 text-[11px] font-medium text-ink-soft">
          <span className="inline-flex items-center gap-1 rounded-md bg-neutral-100 px-2 py-0.5">
            <MapPin size={11} className="text-ink-faint" /> {t('inv.bin')} {pr.binLocation}
          </span>
          <span className="readout">{pr.sku}</span>
          <span>
            {t('inv.qty')} {pr.quantity}
          </span>
        </p>
      </div>

      {pr.status === 'pending_pickup' ? (
        <div className="flex shrink-0 flex-wrap gap-2">
          <Btn
            variant="outline"
            disabled={busy}
            onClick={() => discrepancy.mutate()}
            className="hover:border-accent-100 hover:bg-accent-50 hover:text-accent-700"
          >
            <TriangleAlert size={14} /> {t('inv.notThere')}
          </Btn>
          <Btn variant="success" disabled={busy} onClick={() => pickup.mutate()}>
            {pickup.isPending ? (
              <>
                <LoaderCircle size={14} className="animate-spin" /> {t('inv.confirming')}
              </>
            ) : (
              <>
                <PackageCheck size={14} /> {t('inv.confirmPickup')}
              </>
            )}
          </Btn>
        </div>
      ) : (
        <ResolvedChip status={pr.status} />
      )}
    </div>
  )
}

function ResolvedChip({ status }) {
  const { t } = useI18n()
  if (status === 'picked_up') {
    return (
      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-success-50 px-2 py-0.5 text-[11px] font-semibold text-success">
        <PackageCheck size={11} /> {t('inv.pickedUp')}
      </span>
    )
  }
  if (status === 'discrepancy') {
    return (
      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-accent-50 px-2 py-0.5 text-[11px] font-semibold text-accent-700">
        <TriangleAlert size={11} /> {t('inv.discrepancy')}
      </span>
    )
  }
  return null
}
