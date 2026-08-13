// Lightweight, dependency-free SVG charts, styled with the app's design tokens.

/**
 * Speedometer-style dial for rate metrics.
 *
 * A 240° sweep with the gap at the bottom and a tick ring inside the track — the shape of
 * a real panel instrument rather than a progress bar bent into a circle. The bottom gap
 * holds the caption, so the whole widget stays self-contained.
 */
export function Gauge({ value, max = 100, caption, color = 'var(--color-primary)', size = 108, suffix = '%' }) {
  const SWEEP = 240
  const START = 150 // degrees, measured from 3 o'clock — puts the gap at the bottom
  const stroke = 9
  const cx = size / 2
  const cy = size / 2
  const r = (size - stroke) / 2 - 2
  const circ = 2 * Math.PI * r
  const arc = circ * (SWEEP / 360)
  const pct = Math.max(0, Math.min(1, (Number(value) || 0) / max))

  // Ticks sit just inside the track so the dial keeps its bounding box.
  const ticks = Array.from({ length: 9 }, (_, i) => {
    const a = ((START + (SWEEP / 8) * i) * Math.PI) / 180
    const inner = r - stroke / 2 - 6
    const outer = r - stroke / 2 - 2
    return {
      x1: cx + inner * Math.cos(a), y1: cy + inner * Math.sin(a),
      x2: cx + outer * Math.cos(a), y2: cy + outer * Math.sin(a),
    }
  })

  // The arc bottoms out at cy + r*sin(150°); cropping the empty rest keeps it compact.
  const height = Math.round(size * 0.8)

  return (
    <svg
      width={size}
      height={height}
      viewBox={`0 0 ${size} ${height}`}
      role="img"
      aria-label={`${caption ?? 'Gauge'}: ${value}${suffix}`}
    >
      <g transform={`rotate(${START} ${cx} ${cy})`}>
        <circle
          cx={cx} cy={cy} r={r}
          fill="none" stroke="var(--color-grid-line)" strokeWidth={stroke}
          strokeDasharray={`${arc} ${circ}`} strokeLinecap="round"
        />
        <circle
          cx={cx} cy={cy} r={r}
          fill="none" stroke={color} strokeWidth={stroke}
          strokeDasharray={`${arc * pct} ${circ}`} strokeLinecap="round"
          style={{ transition: 'stroke-dasharray 0.6s cubic-bezier(0.22, 1, 0.36, 1)' }}
        />
      </g>
      {ticks.map((t, i) => (
        <line
          key={i} x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2}
          stroke="var(--color-grid-line)" strokeWidth={1.5} strokeLinecap="round"
        />
      ))}
      <text
        x={cx} y={cy + 2} textAnchor="middle" dominantBaseline="central"
        style={{ fill: 'var(--color-ink)', fontSize: 23, fontWeight: 600, fontFamily: 'var(--font-mono)' }}
      >
        {value}
        <tspan style={{ fontSize: 13, fill: 'var(--color-ink-faint)' }}>{suffix}</tspan>
      </text>
      {caption && (
        <text
          x={cx} y={height - 5} textAnchor="middle"
          style={{
            fill: 'var(--color-ink-faint)', fontSize: 9, fontWeight: 600,
            letterSpacing: '0.12em', textTransform: 'uppercase', fontFamily: 'var(--font-mono)',
          }}
        >
          {caption}
        </text>
      )}
    </svg>
  )
}

export function DonutChart({ data, size = 132, thickness = 18 }) {
  const total = data.reduce((s, d) => s + d.value, 0)
  const r = (size - thickness) / 2
  const circ = 2 * Math.PI * r
  let offset = 0

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Distribution chart">
      <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-line)" strokeWidth={thickness} />
        {total > 0 &&
          data.map((d, i) => {
            const len = (d.value / total) * circ
            const seg = (
              <circle
                key={i}
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                stroke={d.color}
                strokeWidth={thickness}
                strokeDasharray={`${len} ${circ - len}`}
                strokeDashoffset={-offset}
                strokeLinecap="butt"
              />
            )
            offset += len
            return seg
          })}
      </g>
      <text
        x="50%"
        y="50%"
        textAnchor="middle"
        dominantBaseline="central"
        style={{ fill: 'var(--color-ink)', fontSize: 26, fontWeight: 700 }}
      >
        {total}
      </text>
    </svg>
  )
}

export function ChartLegend({ data }) {
  return (
    <ul className="space-y-1.5">
      {data.map((d) => (
        <li key={d.label} className="flex items-center gap-2 text-xs">
          <span className="size-2.5 shrink-0 rounded-sm" style={{ background: d.color }} />
          <span className="text-ink-soft">{d.label}</span>
          <span className="ml-auto font-semibold tabular-nums text-ink">{d.value}</span>
        </li>
      ))}
    </ul>
  )
}

export function BarRows({ data }) {
  const max = Math.max(1, ...data.map((d) => d.value))
  return (
    <div className="space-y-3">
      {data.map((d) => (
        <div key={d.label}>
          <div className="flex items-center justify-between text-xs">
            <span className="text-ink-soft">{d.label}</span>
            <span className="font-semibold tabular-nums">{d.value}</span>
          </div>
          <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-neutral-100">
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${(d.value / max) * 100}%`, background: d.color, minWidth: d.value ? '0.5rem' : 0 }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

/**
 * Findings per day, area + line, with High-severity stacked underneath.
 *
 * The dashboard previously had no time dimension at all — every widget showed a snapshot,
 * so "is this getting better or worse?" was unanswerable. Zero days are plotted as zero
 * rather than skipped, so a quiet day reads as quiet instead of compressing the axis.
 */
export function TrendChart({ data = [], height = 132, labels = {} }) {
  if (!data.length) return null

  const width = 560
  const padY = 10
  const max = Math.max(1, ...data.map((d) => d.total))
  const stepX = data.length > 1 ? width / (data.length - 1) : width
  const y = (v) => padY + (1 - v / max) * (height - padY * 2)
  const pt = (d, i) => [i * stepX, y(d.total)]

  const linePath = data.map((d, i) => `${i === 0 ? 'M' : 'L'}${pt(d, i).join(' ')}`).join(' ')
  const areaPath = `${linePath} L${(data.length - 1) * stepX} ${height} L0 ${height} Z`
  const highPath = data
    .map((d, i) => `${i === 0 ? 'M' : 'L'}${i * stepX} ${y(d.high)}`)
    .join(' ')

  const dayLabel = (iso) =>
    new Date(iso).toLocaleDateString(undefined, { weekday: 'short' }).slice(0, 3)

  return (
    <div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-auto w-full overflow-visible"
        role="img"
        aria-label={labels.title ?? 'Findings trend'}
      >
        <defs>
          <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-primary)" stopOpacity="0.28" />
            <stop offset="100%" stopColor="var(--color-primary)" stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {/* Horizontal guides give the eye a baseline to judge the slope against. */}
        {[0, 0.5, 1].map((f) => (
          <line
            key={f}
            x1="0"
            x2={width}
            y1={padY + f * (height - padY * 2)}
            y2={padY + f * (height - padY * 2)}
            stroke="var(--color-grid-line)"
            strokeWidth="1"
            strokeDasharray={f === 1 ? '0' : '3 5'}
            opacity={f === 1 ? 0.8 : 0.5}
          />
        ))}

        <path d={areaPath} fill="url(#trendFill)" />
        <path d={linePath} fill="none" stroke="var(--color-primary)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        <path d={highPath} fill="none" stroke="var(--color-accent)" strokeWidth="2" strokeDasharray="4 4" strokeLinejoin="round" opacity="0.9" />

        {data.map((d, i) => (
          <circle key={d.date} cx={i * stepX} cy={y(d.total)} r="3.5" fill="var(--color-primary)">
            <title>{`${d.date}: ${d.total} findings (${d.high} high)`}</title>
          </circle>
        ))}
      </svg>

      <div className="mt-1.5 flex justify-between">
        {data.map((d) => (
          <span key={d.date} className="readout text-[9px] text-ink-faint">
            {dayLabel(d.date)}
          </span>
        ))}
      </div>

      <div className="mt-2 flex items-center gap-4">
        <span className="flex items-center gap-1.5 text-[11px] text-ink-soft">
          <span className="h-0.5 w-4 rounded" style={{ background: 'var(--color-primary)' }} />
          {labels.total ?? 'All findings'}
        </span>
        <span className="flex items-center gap-1.5 text-[11px] text-ink-soft">
          <span
            className="h-0.5 w-4 rounded"
            style={{ background: 'repeating-linear-gradient(90deg,var(--color-accent) 0 4px,transparent 4px 8px)' }}
          />
          {labels.high ?? 'High severity'}
        </span>
      </div>
    </div>
  )
}
