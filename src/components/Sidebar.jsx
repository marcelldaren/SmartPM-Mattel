import {
  Wrench, LayoutDashboard, ClipboardCheck, Search, MailCheck, LogOut, Bot, TrendingUp,
  FileText, Settings, X, Boxes,
} from 'lucide-react'
import { useAuth } from '../lib/auth'
import { useI18n } from '../lib/i18n'
import { LanguageToggle, ThemeToggle } from './PrefToggles'

const NAV = [
  { id: 'dashboard', key: 'nav.dashboard', icon: LayoutDashboard },
  { id: 'checksheet', key: 'nav.checksheet', icon: ClipboardCheck },
  { id: 'search', key: 'nav.search', icon: Search },
  { id: 'assistant', key: 'nav.assistant', icon: Bot },
  { id: 'insights', key: 'nav.insights', icon: TrendingUp },
  { id: 'reports', key: 'nav.reports', icon: FileText },
  { id: 'inventory', key: 'nav.inventory', icon: Boxes },
  { id: 'approvals', key: 'nav.approvals', icon: MailCheck, roles: ['supervisor'] },
  { id: 'settings', key: 'nav.settings', icon: Settings, roles: ['supervisor'] },
]

/**
 * Navigation. On desktop this is a permanent 240px column; below `lg` it becomes an
 * off-canvas drawer, because a fixed 240px rail leaves roughly 110px of usable width on a
 * phone. The markup is shared — only the positioning classes differ — so there is no
 * separate mobile nav to keep in sync.
 */
export default function Sidebar({ screen, go, pendingCount, pickupCount = 0, open = false, onClose = () => {} }) {
  const { user, logout } = useAuth()
  const { t } = useI18n()
  const nav = NAV.filter((n) => !n.roles || n.roles.includes(user.role))
  const initials = user.displayName
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()

  return (
    <>
      {/* Tap-anywhere-to-close backdrop, mobile only. */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-steel-900/40 lg:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* h-dvh, not h-screen: 100vh on a phone includes the area behind the browser's
          address bar, which pushes this column's footer — and the sign-out button in it —
          below the visible viewport. dvh tracks the actually-visible height. */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex h-dvh w-60 shrink-0 flex-col overflow-y-auto border-r border-line bg-surface transition-transform duration-200 ease-out lg:sticky lg:top-0 lg:z-auto lg:h-screen lg:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center gap-2.5 p-4">
          <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary text-white">
            <Wrench size={18} />
          </div>
          <div className="leading-tight">
            <div className="text-[15px] font-bold tracking-tight">SmartPM</div>
            <div className="text-[11px] text-ink-faint">{t('app.subtitle')}</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('nav.closeMenu')}
            className="ml-auto grid size-8 cursor-pointer place-items-center rounded-md text-ink-faint transition-colors hover:bg-neutral-100 hover:text-ink lg:hidden"
          >
            <X size={17} />
          </button>
        </div>

      <nav className="mt-2 space-y-1 px-3">
        {nav.map(({ id, key, icon: Icon }) => {
          const active = screen === id
          return (
            <button
              key={id}
              type="button"
              onClick={() => {
                go(id)
                onClose()
              }}
              className={`flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                active ? 'bg-primary-50 text-primary' : 'text-ink-soft hover:bg-neutral-100 hover:text-ink'
              }`}
            >
              <Icon size={16} />
              {t(key)}
              {id === 'approvals' && pendingCount > 0 && (
                <span className="ml-auto grid h-5 min-w-5 place-items-center rounded-full bg-accent px-1.5 text-[11px] font-semibold text-white">
                  {pendingCount}
                </span>
              )}
              {id === 'inventory' && pickupCount > 0 && (
                <span className="ml-auto grid h-5 min-w-5 place-items-center rounded-full bg-primary px-1.5 text-[11px] font-semibold text-white">
                  {pickupCount}
                </span>
              )}
            </button>
          )
        })}
      </nav>

      <div className="mt-auto border-t border-line p-3">
        <div className="mb-2 flex items-center justify-between gap-2 px-1">
          <LanguageToggle />
          <ThemeToggle />
        </div>
        <div className="flex items-center gap-2.5 rounded-lg px-2 py-1.5">
          <div className="grid size-8 shrink-0 place-items-center rounded-full bg-primary-100 text-xs font-bold text-primary">
            {initials}
          </div>
          <div className="min-w-0 flex-1 leading-tight">
            <div className="truncate text-[13px] font-semibold">{user.displayName}</div>
            <div className="truncate text-[11px] text-ink-faint capitalize">{user.role} — PTMI</div>
          </div>
          <button
            type="button"
            onClick={() => logout()}
            title={t('nav.signOut')}
            className="grid size-7 shrink-0 cursor-pointer place-items-center rounded-md text-ink-faint transition-colors hover:bg-neutral-100 hover:text-ink"
          >
            <LogOut size={14} />
          </button>
        </div>
      </div>
      </aside>
    </>
  )
}
