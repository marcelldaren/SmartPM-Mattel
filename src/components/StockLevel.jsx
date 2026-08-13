import { CircleCheck, CircleSlash, TriangleAlert } from 'lucide-react'
import { useI18n } from '../lib/i18n'

/**
 * Stock-level language, shared by the Inventory screen and the Approvals pull-request
 * section so the two never drift.
 *
 * Reuses the app's existing status palette rather than inventing one: success green for
 * healthy, accent orange for low, signal red for out — the same three tones StatusBadge
 * and the dashboard plant map already use for "fine / needs attention / stop".
 */
export const STOCK_TONES = {
  healthy: {
    bar: 'bg-success',
    chip: 'bg-success-50 text-success',
    icon: CircleCheck,
  },
  low: {
    bar: 'bg-accent',
    chip: 'bg-accent-50 text-accent-700',
    icon: TriangleAlert,
  },
  out: {
    bar: 'bg-signal-red',
    chip: 'bg-signal-red/10 text-signal-red',
    icon: CircleSlash,
  },
}

export function StockChip({ level }) {
  const { t } = useI18n()
  const tone = STOCK_TONES[level] ?? STOCK_TONES.healthy
  const Icon = tone.icon
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ${tone.chip}`}
    >
      <Icon size={11} /> {t(`inv.level.${level}`)}
    </span>
  )
}

/**
 * Filled bar showing quantity against bin capacity.
 *
 * A bar rather than a bare number because "3" means nothing without knowing whether the
 * bin holds 4 or 40. An out-of-stock row still renders the track with a hairline marker
 * at the reorder point, so an empty bin reads as empty rather than as a missing widget.
 */
export function StockBar({ quantity, max, threshold, level, reserved = 0 }) {
  const capacity = Math.max(max || 0, quantity, 1)
  const pct = Math.min(100, Math.round((quantity / capacity) * 100))
  const reservedPct = Math.min(100 - pct, Math.round((Math.min(reserved, quantity) / capacity) * 100))
  const thresholdPct = threshold > 0 ? Math.min(100, (threshold / capacity) * 100) : null
  const tone = STOCK_TONES[level] ?? STOCK_TONES.healthy

  return (
    <div className="relative h-2 w-full overflow-hidden rounded-full bg-neutral-200/70">
      <div className={`h-full ${tone.bar} transition-[width] duration-300`} style={{ width: `${pct}%` }} />
      {/* Units promised to open pull requests but still on the shelf — hatched, because
          they are physically present yet not available to a new request. */}
      {reservedPct > 0 && (
        <div
          className="absolute inset-y-0 opacity-45"
          style={{
            left: `${pct - reservedPct}%`,
            width: `${reservedPct}%`,
            backgroundImage:
              'repeating-linear-gradient(45deg, #fff 0 2px, transparent 2px 4px)',
          }}
        />
      )}
      {thresholdPct !== null && (
        <span
          className="absolute inset-y-0 w-px bg-ink/35"
          style={{ left: `${thresholdPct}%` }}
          title="Reorder point"
        />
      )}
    </div>
  )
}
