import { useState } from 'react'
import { CircleCheck, CircleHelp, CircleSlash, LoaderCircle, TriangleAlert } from 'lucide-react'
import { useI18n } from '../lib/i18n'

/**
 * Advisory AI photo-verification badge.
 *
 * The wording is deliberately hedged — "needs a second look", not "wrong". This signal is
 * one model's read of one photo; it exists to draw a supervisor's eye, never to overrule
 * the technician who was standing in front of the machine.
 */

const STYLES = {
  Consistent: {
    key: 'verify.consistent',
    cls: 'bg-success-50 text-success border-success/20',
    icon: CircleCheck,
  },
  Uncertain: {
    key: 'verify.uncertain',
    cls: 'bg-neutral-100 text-ink-soft border-line',
    icon: CircleHelp,
  },
  'Possible mismatch': {
    key: 'verify.mismatch',
    cls: 'bg-accent-50 text-accent-700 border-accent-100',
    icon: TriangleAlert,
  },
}

const PENDING = { key: 'verify.pending', cls: 'bg-primary-50 text-primary border-primary-100', icon: LoaderCircle }
const INERT = { key: 'verify.none', cls: 'bg-neutral-100 text-ink-faint border-line', icon: CircleSlash }

function styleFor(v) {
  if (v.status === 'pending') return PENDING
  if (v.status === 'done' && STYLES[v.verdict]) return STYLES[v.verdict]
  return INERT
}

export function VerificationBadge({ verification: v, showItem = false }) {
  const [open, setOpen] = useState(false)
  const { t } = useI18n()
  const style = styleFor(v)
  const Icon = style.icon
  const hasDetail = Boolean(v.description || v.reasoning || v.note)

  return (
    <div className="min-w-0">
      <button
        type="button"
        onClick={() => hasDetail && setOpen((o) => !o)}
        title={v.reasoning || v.note || t(style.key)}
        aria-expanded={hasDetail ? open : undefined}
        className={`inline-flex max-w-full items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${style.cls} ${
          hasDetail ? 'cursor-pointer' : 'cursor-default'
        }`}
      >
        <Icon size={12} className={v.status === 'pending' ? 'animate-spin' : ''} />
        <span className="truncate">{t(style.key)}</span>
        {showItem && v.itemLabel && (
          <span className="truncate font-normal opacity-70">· {v.itemLabel}</span>
        )}
      </button>

      {open && hasDetail && (
        <div className="animate-rise mt-2 rounded-lg border border-line bg-neutral-50 p-3 text-left">
          {/* The photo the model actually judged, beside its description — a verdict you
              can't check against its evidence isn't worth much to a supervisor. */}
          {v.thumbnail && (
            <div className="mb-2.5 flex items-start gap-2.5">
              <img
                src={v.thumbnail}
                alt={v.photoName ? `Evidence: ${v.photoName}` : 'Evidence photo'}
                loading="lazy"
                className="size-20 shrink-0 rounded-md border border-line object-cover"
              />
              <div className="min-w-0">
                <p className="readout text-[9px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
                  {t('verify.photo')}
                </p>
                {v.photoName && (
                  <p className="readout mt-1 truncate text-[11px] text-ink-soft">{v.photoName}</p>
                )}
                {v.itemLabel && <p className="mt-0.5 text-[11px] text-ink-faint">{v.itemLabel}</p>}
              </div>
            </div>
          )}
          {v.description && (
            <>
              <p className="readout text-[9px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
                {t('verify.whatSaw')}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-ink-soft">{v.description}</p>
            </>
          )}
          {v.reasoning && (
            <>
              <p className="readout mt-2.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
                {t('verify.whyVerdict')}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-ink-soft">{v.reasoning}</p>
            </>
          )}
          {v.note && <p className="mt-2 text-[11px] leading-relaxed text-ink-faint">{v.note}</p>}
          {v.model && (
            <p className="readout mt-2 text-[10px] text-ink-faint">
              {v.model} · {t('verify.advisory')}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * Compact rollup for list views: one badge summarising a whole checksheet's photos.
 * Worst outcome wins, because a mismatch buried under two passes is the thing worth seeing.
 */
export function VerificationSummaryBadge({ summary }) {
  const { t } = useI18n()
  if (!summary || !summary.total) return null
  const { total, mismatch, uncertain, pending } = summary

  if (pending) return <Pill style={PENDING} text={`${pending}/${total}`} />
  if (mismatch) return <Pill style={STYLES['Possible mismatch']} text={`${mismatch}`} />
  if (uncertain) return <Pill style={STYLES.Uncertain} text={`${uncertain}`} />
  return <Pill style={STYLES.Consistent} text={total > 1 ? `${total}` : t('verify.consistent')} />
}

function Pill({ style, text }) {
  const Icon = style.icon
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] font-semibold ${style.cls}`}
    >
      <Icon size={10} className={style === PENDING ? 'animate-spin' : ''} />
      {text}
    </span>
  )
}
