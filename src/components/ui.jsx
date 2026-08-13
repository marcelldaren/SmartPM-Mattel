import { ChevronDown } from 'lucide-react'
import { useI18n } from '../lib/i18n'

export function Card({ className = '', children, ...props }) {
  return (
    <div className={`rounded-lg border border-line/70 bg-surface shadow-xs ${className}`} {...props}>
      {children}
    </div>
  )
}

export function ScreenHeader({ title, sub, children }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3 sm:mb-6 sm:gap-4">
      <div>
        <h1 className="text-xl font-bold tracking-tight sm:text-2xl">{title}</h1>
        {sub && <p className="mt-1 text-sm text-ink-soft">{sub}</p>}
      </div>
      {children && <div className="flex items-center gap-2">{children}</div>}
    </div>
  )
}

const BTN_VARIANTS = {
  primary: 'bg-primary text-white hover:bg-primary-700',
  success: 'bg-success text-white hover:bg-success-700',
  outline: 'border border-line bg-surface text-ink-soft hover:border-neutral-300 hover:bg-neutral-50 hover:text-ink',
  ghost: 'text-ink-soft hover:bg-neutral-100 hover:text-ink',
}

export function Btn({ variant = 'primary', className = '', ...props }) {
  return (
    <button
      type="button"
      className={`inline-flex h-9 cursor-pointer items-center justify-center gap-2 rounded-lg px-3.5 text-sm font-medium transition-colors outline-primary/50 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:pointer-events-none disabled:opacity-45 ${BTN_VARIANTS[variant]} ${className}`}
      {...props}
    />
  )
}

const STATUS_STYLES = {
  Complete: 'bg-success-50 text-success',
  Flagged: 'bg-accent-50 text-accent-700',
  'Pending Approval': 'bg-neutral-100 text-neutral-500',
}

export function StatusBadge({ status }) {
  const { tv } = useI18n()
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[status] ?? STATUS_STYLES['Pending Approval']}`}>
      <span className="size-1.5 rounded-full bg-current" />
      {tv('st', status)}
    </span>
  )
}

const SEVERITY_STYLES = {
  High: 'bg-accent text-white',
  Medium: 'bg-accent-50 text-accent-700',
  Low: 'bg-neutral-100 text-neutral-500',
}

export function SeverityChip({ level }) {
  const { tv } = useI18n()
  return (
    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${SEVERITY_STYLES[level]}`}>
      {tv('sev', level)}
    </span>
  )
}

const TONE_STYLES = {
  primary: 'bg-primary-50 text-primary',
  accent: 'bg-accent-50 text-accent',
  success: 'bg-success-50 text-success',
  neutral: 'bg-neutral-100 text-ink-soft',
}

export function SoftIcon({ icon: Icon, tone = 'primary' }) {
  return (
    <div className={`grid size-9 shrink-0 place-items-center rounded-lg ${TONE_STYLES[tone]}`}>
      <Icon size={17} />
    </div>
  )
}

export function Select({ value, onChange, children, placeholder, className = '' }) {
  return (
    <div className={`relative ${className}`}>
      <select
        value={value}
        onChange={onChange}
        className={`h-10 w-full cursor-pointer appearance-none rounded-lg border border-line bg-surface pl-3 pr-9 text-sm font-medium transition-colors outline-none hover:border-neutral-400/60 focus:border-primary focus:ring-2 focus:ring-primary/15 ${value === '' ? 'text-ink-faint' : 'text-ink'}`}
      >
        {placeholder && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {children}
      </select>
      <ChevronDown size={15} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-faint" />
    </div>
  )
}
