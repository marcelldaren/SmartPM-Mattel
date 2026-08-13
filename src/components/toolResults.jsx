import { useState } from 'react'
import {
  Boxes, ChevronDown, Gauge, MapPin, Package, PackageCheck, Repeat2, Search, TriangleAlert, Wrench,
} from 'lucide-react'
import { fmtIDR } from '../data'
import { SeverityChip } from './ui'
import { StockBar, StockChip } from './StockLevel'

/**
 * One visual identity per tool, shared by the chip strip and the data panel below it. The
 * chip and the panel it produced carry the same icon and colour on purpose — during a demo
 * that makes "the agent called this tool, and here is what came back" readable at a glance
 * rather than something you have to take on faith.
 */
export const TOOL_META = {
  search_records: {
    icon: Search,
    chip: 'Searched records',
    badge: 'bg-primary-50 text-primary',
    tile: 'bg-primary-50 text-primary',
  },
  list_recurring_issues: {
    icon: Repeat2,
    chip: 'Checked recurrence',
    badge: 'bg-accent-50 text-accent-700',
    tile: 'bg-accent-50 text-accent',
  },
  get_machine_status: {
    icon: Gauge,
    chip: 'Read machine status',
    badge: 'bg-success-50 text-success',
    tile: 'bg-success-50 text-success',
  },
  list_pending_part_requests: {
    icon: Package,
    chip: 'Read approval queue',
    badge: 'bg-steel-900/10 text-steel-900',
    tile: 'bg-steel-900/10 text-steel-900',
  },
  check_part_stock: {
    icon: Boxes,
    chip: 'Checked warehouse stock',
    badge: 'bg-primary-100 text-primary-800',
    tile: 'bg-primary-100 text-primary-800',
  },
  list_pending_pickups: {
    icon: PackageCheck,
    chip: 'Read pickup queue',
    badge: 'bg-success-100 text-success-700',
    tile: 'bg-success-100 text-success-700',
  },
}

/** The strip of "what the agent actually ran", in call order. */
export function ToolChips({ names = [] }) {
  const unique = [...new Set(names)]
  if (!unique.length) return null
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="readout text-[9px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
        Tools run
      </span>
      {unique.map((n) => {
        const meta = TOOL_META[n]
        const Icon = meta?.icon ?? Wrench
        return (
          <span
            key={n}
            className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
              meta?.badge ?? 'bg-neutral-100 text-ink-soft'
            }`}
          >
            <Icon size={10} strokeWidth={2.4} />
            {meta?.chip ?? n}
          </span>
        )
      })}
    </div>
  )
}

/**
 * Rich renderers for the assistant's tool results. The agent already fetches real,
 * structured data from the database on every tool call — these components display that
 * data directly instead of letting it collapse into a wall of prose. Each panel is
 * collapsible so a long multi-tool answer stays scannable.
 */

const idr = (n) => fmtIDR(Number(n) || 0)
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`

function Panel({ tool, title, meta, children }) {
  const [open, setOpen] = useState(true)
  const style = TOOL_META[tool] ?? {}
  const Icon = style.icon ?? Wrench
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-surface shadow-xs">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full cursor-pointer items-center gap-2.5 px-3.5 py-2.5 text-left transition-colors hover:bg-neutral-50"
      >
        <div className={`grid size-7 shrink-0 place-items-center rounded-lg ${style.tile ?? 'bg-neutral-100 text-ink-soft'}`}>
          <Icon size={14} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-semibold text-ink">{title}</p>
          {meta && <p className="truncate text-[11px] text-ink-faint">{meta}</p>}
        </div>
        <ChevronDown
          size={14}
          className={`shrink-0 text-ink-faint transition-transform ${open ? '' : '-rotate-90'}`}
        />
      </button>
      {open && <div className="border-t border-line/70">{children}</div>}
    </div>
  )
}

function Empty({ text }) {
  return <p className="px-3.5 py-3 text-xs text-ink-faint">{text}</p>
}

function Stat({ label, value, tone = 'neutral' }) {
  const color = tone === 'accent' ? 'text-accent' : tone === 'success' ? 'text-success' : 'text-ink'
  return (
    <div className="flex flex-col justify-center px-3 py-2.5 text-center">
      <p className={`text-lg font-bold leading-tight ${color}`}>{value}</p>
      <p className="mt-0.5 text-[10px] uppercase tracking-wide text-ink-faint">{label}</p>
    </div>
  )
}

function SearchPanel({ args, result }) {
  const results = result?.results ?? []
  return (
    <Panel
      tool="search_records"
      title="Searched maintenance records"
      meta={`"${args.query ?? ''}" · ${plural(results.length, 'match')}`}
    >
      {results.length === 0 ? (
        <Empty text={result?.summary || 'No matching records found.'} />
      ) : (
        <ul className="divide-y divide-line/70">
          {results.map((r) => (
            <li key={r.sheet} className="px-3.5 py-2.5">
              <div className="flex items-center gap-2">
                <span className="shrink-0 rounded bg-primary-50 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-primary">
                  {r.sheet}
                </span>
                <span className="truncate text-xs font-semibold text-ink">{r.finding}</span>
              </div>
              <p className="mt-1 truncate text-[11px] text-ink-faint">
                {r.machine} · {r.tech} · {r.date}
              </p>
              {r.reason && (
                <p className="mt-1 border-l-2 border-primary-100 pl-2 text-[11px] leading-relaxed text-ink-soft">
                  {r.reason}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}

function RecurringPanel({ result }) {
  const rows = Array.isArray(result) ? result : []
  return (
    <Panel
      tool="list_recurring_issues"
      title="Recurring inspection failures"
      meta={rows.length ? `${plural(rows.length, 'inspection point')} failing repeatedly` : undefined}
    >
      {rows.length === 0 ? (
        <Empty text={result?.message ?? 'No inspection point has failed more than once yet.'} />
      ) : (
        <ul className="divide-y divide-line/70">
          {rows.map((r, i) => (
            <li key={i} className="flex items-center gap-3 px-3.5 py-2.5">
              <div
                className={`grid size-9 shrink-0 place-items-center rounded-lg text-sm font-bold ${
                  r.occurrences >= 3 ? 'bg-accent text-white' : 'bg-accent-50 text-accent-700'
                }`}
              >
                {r.occurrences}×
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold text-ink">{r.item}</p>
                <p className="truncate text-[11px] text-ink-faint">
                  {r.machine} · {r.category}
                </p>
              </div>
              {r.pmInterval && (
                <span className="shrink-0 rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-medium text-ink-soft">
                  PM {r.pmInterval}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}

function MachinePanel({ args, result }) {
  if (!result || result.error) {
    return (
      <Panel tool="get_machine_status" title="Machine status" meta={args.machine}>
        <Empty text={result?.error ?? 'No machine matched that name or code.'} />
      </Panel>
    )
  }
  return (
    <Panel tool="get_machine_status" title={result.machine} meta={`${result.code} · ${result.area}`}>
      <div className="grid grid-cols-3 divide-x divide-line/70">
        <Stat
          label="Open findings"
          value={result.openFindings}
          tone={result.openFindings > 0 ? 'accent' : 'success'}
        />
        <Stat
          label="Pending parts"
          value={result.pendingPartRequests}
          tone={result.pendingPartRequests > 0 ? 'accent' : 'success'}
        />
        <Stat label="Next PM" value={result.dueLabel} />
      </div>
      <p className="border-t border-line/70 px-3.5 py-2 text-[11px] text-ink-faint">
        PM interval {result.pmIntervalLabel} · last PM {result.lastPmDate}
      </p>
      {result.recentFindings?.length > 0 && (
        <ul className="divide-y divide-line/70 border-t border-line/70">
          {result.recentFindings.map((f, i) => (
            <li key={i} className="flex items-center gap-2.5 px-3.5 py-2">
              <SeverityChip level={f.severity} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-ink">{f.finding}</p>
                <p className="truncate text-[11px] text-ink-faint">
                  {f.item} · {f.sheet}
                </p>
              </div>
              <span className="shrink-0 text-[10px] text-ink-faint">{f.when}</span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}

function PendingPanel({ result }) {
  const rows = Array.isArray(result) ? result : []
  const total = rows.reduce((sum, r) => sum + (Number(r.cost) || 0), 0)
  return (
    <Panel
      tool="list_pending_part_requests"
      title="Part requests awaiting approval"
      meta={rows.length ? `${plural(rows.length, 'request')} · ${idr(total)}` : undefined}
    >
      {rows.length === 0 ? (
        <Empty text={result?.message ?? 'There are no part requests awaiting approval.'} />
      ) : (
        <>
          <ul className="divide-y divide-line/70">
            {rows.map((r) => (
              <li key={r.id} className="flex items-start gap-3 px-3.5 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="shrink-0 rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-ink-soft">
                      {r.id}
                    </span>
                    <span className="truncate text-xs font-semibold text-ink">{r.part}</span>
                  </div>
                  <p className="mt-0.5 truncate text-[11px] text-ink-faint">
                    {r.machine} · {r.vendor}
                  </p>
                  {r.note && <p className="mt-0.5 truncate text-[10px] text-accent-700">{r.note}</p>}
                </div>
                <span className="shrink-0 readout text-xs font-semibold text-ink">{idr(r.cost)}</span>
              </li>
            ))}
          </ul>
          <div className="flex items-center justify-between border-t border-line/70 bg-neutral-50 px-3.5 py-2">
            <span className="text-[11px] font-medium text-ink-soft">Total pending</span>
            <span className="readout text-xs font-bold text-ink">{idr(total)}</span>
          </div>
        </>
      )}
    </Panel>
  )
}


/**
 * Warehouse stock. The chat answer reuses the exact bar and chip components the Inventory
 * screen renders, so a part reported as "low" in conversation looks identical to the same
 * part on its own screen — the assistant is showing the inventory, not a second opinion
 * about it.
 */
function StockPanel({ args, result }) {
  const parts = result?.parts ?? []
  const s = result?.summary ?? {}
  const filters = [args.query, args.machine, args.category, args.level].filter(Boolean).join(' · ')

  return (
    <Panel
      tool="check_part_stock"
      title="Warehouse spare-parts stock"
      meta={filters || `${plural(s.totalTracked ?? parts.length, 'part')} tracked`}
    >
      {(s.totalTracked ?? 0) > 0 && (
        <div className="grid grid-cols-3 divide-x divide-line/70 border-b border-line/70 bg-neutral-50/60">
          <Stat label="Matched" value={s.matched ?? parts.length} />
          <Stat label="Low stock" value={s.low ?? 0} tone={s.low > 0 ? 'accent' : 'success'} />
          <Stat label="Out of stock" value={s.out ?? 0} tone={s.out > 0 ? 'accent' : 'success'} />
        </div>
      )}

      {parts.length === 0 ? (
        <Empty text={result?.message ?? 'No parts in the warehouse matched that.'} />
      ) : (
        <ul className="divide-y divide-line/70">
          {parts.map((p) => (
            <li key={p.sku} className="px-3.5 py-2.5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold text-ink">{p.part}</p>
                  <p className="readout mt-0.5 truncate text-[10px] text-ink-faint">
                    {p.sku} · {p.machine}
                  </p>
                </div>
                <StockChip level={p.level} />
              </div>

              <div className="mt-2 flex items-center gap-2.5">
                {/* Bin is the actionable field — a technician acts on "C1-07", not on "12". */}
                <span className="readout inline-flex shrink-0 items-center gap-1 rounded-md bg-steel-900 px-1.5 py-0.5 text-[10px] font-bold text-primary-200">
                  <MapPin size={9} /> {p.bin}
                </span>
                <div className="min-w-0 flex-1">
                  <StockBar
                    quantity={p.onHand}
                    max={p.maxQuantity}
                    threshold={p.reorderAt}
                    level={p.level}
                    reserved={p.reserved}
                  />
                </div>
                <span className="readout shrink-0 text-[11px] font-bold text-ink">
                  {p.onHand}
                  <span className="font-normal text-ink-faint">/{p.maxQuantity}</span>
                </span>
              </div>

              {(p.reserved > 0 || p.needsRecount) && (
                <p className="mt-1.5 flex flex-wrap items-center gap-x-2 text-[10px] text-ink-faint">
                  {p.reserved > 0 && <span>{p.reserved} reserved · {p.available} available</span>}
                  {p.needsRecount && (
                    <span className="inline-flex items-center gap-1 font-semibold text-accent-700">
                      <TriangleAlert size={9} /> flagged for recount
                    </span>
                  )}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}

/** Parts already in stock and waiting to be collected — the other half of "outstanding". */
function PickupPanel({ result }) {
  const rows = Array.isArray(result) ? result : []
  return (
    <Panel
      tool="list_pending_pickups"
      title="Parts waiting to be collected"
      meta={rows.length ? `${plural(rows.length, 'pull request')} · no vendor, no cost` : undefined}
    >
      {rows.length === 0 ? (
        <Empty text={result?.message ?? 'No parts are waiting to be collected from the warehouse.'} />
      ) : (
        <ul className="divide-y divide-line/70">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center gap-3 px-3.5 py-2.5">
              <div className="blueprint-grid grid size-11 shrink-0 flex-col place-items-center rounded-lg border border-steel-800 bg-steel-900 text-primary-200">
                <MapPin size={11} />
                <span className="readout mt-0.5 text-[9px] font-bold leading-none">{r.bin}</span>
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="readout shrink-0 rounded bg-success-50 px-1.5 py-0.5 text-[10px] font-semibold text-success">
                    {r.id}
                  </span>
                  <span className="truncate text-xs font-semibold text-ink">{r.part}</span>
                </div>
                <p className="mt-0.5 truncate text-[11px] text-ink-faint">
                  {r.machine} · {r.item} · {r.technician}
                </p>
              </div>
              <span className="readout shrink-0 rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-semibold text-ink-soft">
                ×{r.quantity}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}

/** Renders one executed tool call as a data panel. Unknown tools render nothing. */
export function ToolResult({ call }) {
  const args = call.args ?? {}
  switch (call.name) {
    case 'search_records':
      return <SearchPanel args={args} result={call.result} />
    case 'list_recurring_issues':
      return <RecurringPanel result={call.result} />
    case 'get_machine_status':
      return <MachinePanel args={args} result={call.result} />
    case 'list_pending_part_requests':
      return <PendingPanel result={call.result} />
    case 'check_part_stock':
      return <StockPanel args={args} result={call.result} />
    case 'list_pending_pickups':
      return <PickupPanel result={call.result} />
    default:
      return null
  }
}
