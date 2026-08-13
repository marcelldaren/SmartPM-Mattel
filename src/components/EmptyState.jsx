/**
 * Illustrated empty states.
 *
 * Same blueprint line-art language as the machine icons: hairline strokes, no fills, a
 * single accent colour per drawing. These only replace the *markup* inside existing empty
 * branches — the conditions that decide when an empty state shows are untouched.
 */

function Art({ children, className = '' }) {
  return (
    <svg
      viewBox="0 0 120 96"
      className={`mx-auto h-auto w-28 ${className}`}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  )
}

/** Clipboard with unfilled inspection rows — "nothing has been checked off yet". */
export function ChecklistArt() {
  return (
    <Art className="text-grid-line">
      <rect x="31" y="16" width="58" height="72" rx="6" />
      <rect x="49" y="9" width="22" height="13" rx="3.5" />
      {[38, 52, 66].map((y) => (
        <g key={y}>
          <rect x="41" y={y} width="8" height="8" rx="2" />
          <path d={`M55 ${y + 4}h24`} strokeDasharray="3 5" />
        </g>
      ))}
      <path d="m42.8 42 2 2 3.6-4.2" className="text-primary" stroke="currentColor" />
    </Art>
  )
}

/** Out-tray, sent envelope, and a cleared badge — "the queue is empty, not broken". */
export function ApprovalsArt() {
  return (
    <Art className="text-grid-line">
      <rect x="38" y="20" width="40" height="28" rx="3.5" />
      <path d="m38 24 20 14 20-14" />
      <path d="M24 58h18l5 9h26l5-9h18v20a6 6 0 0 1-6 6H30a6 6 0 0 1-6-6z" />
      <g className="text-signal-green" stroke="currentColor">
        <circle cx="86" cy="26" r="11" />
        <path d="m81 26 3.4 3.4L91 22.6" />
      </g>
    </Art>
  )
}

/** Records under a magnifier — "the index is here, it just hasn't been queried". */
export function SearchArt() {
  return (
    <Art className="text-grid-line">
      <rect x="20" y="24" width="46" height="13" rx="3.5" />
      <rect x="20" y="43" width="46" height="13" rx="3.5" />
      <rect x="20" y="62" width="30" height="13" rx="3.5" />
      <g className="text-primary" stroke="currentColor">
        <circle cx="79" cy="47" r="18" strokeWidth={2} />
        <path d="m92 60 10 10" strokeWidth={2.6} />
      </g>
    </Art>
  )
}

export function EmptyState({ art: ArtComponent, title, body, className = '', children }) {
  return (
    <div className={`text-center ${className}`}>
      <ArtComponent />
      <p className="mt-4 text-sm font-medium">{title}</p>
      {body && <p className="mx-auto mt-1.5 max-w-sm text-xs leading-relaxed text-ink-faint">{body}</p>}
      {children}
    </div>
  )
}
