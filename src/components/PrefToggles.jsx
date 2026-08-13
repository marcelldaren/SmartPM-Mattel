import { Moon, Sun } from 'lucide-react'
import { LANGUAGES, useI18n } from '../lib/i18n'
import { useTheme } from '../lib/theme'

/**
 * Language and theme switches.
 *
 * Both are pure display preferences stored in localStorage, so they need no backend call
 * and apply instantly. Kept together in one small component because they live side by
 * side in the sidebar footer and in the mobile top bar.
 */
export function LanguageToggle({ compact = false }) {
  const { lang, setLang, t } = useI18n()
  return (
    <div
      className="inline-flex items-center rounded-lg border border-line bg-surface p-0.5"
      role="group"
      aria-label={t('lang.label')}
    >
      {LANGUAGES.map((l) => (
        <button
          key={l.code}
          type="button"
          onClick={() => setLang(l.code)}
          aria-pressed={lang === l.code}
          title={l.label}
          className={`readout cursor-pointer rounded-md px-2 py-1 text-[10px] font-semibold transition-colors ${
            lang === l.code ? 'bg-primary text-white' : 'text-ink-faint hover:text-ink'
          }`}
        >
          {compact ? l.short : l.short}
        </button>
      ))}
    </div>
  )
}

export function ThemeToggle() {
  const { isDark, toggleTheme } = useTheme()
  const { t } = useI18n()
  const label = isDark ? t('theme.toLight') : t('theme.toDark')
  return (
    <button
      type="button"
      onClick={toggleTheme}
      title={label}
      aria-label={label}
      className="grid size-8 shrink-0 cursor-pointer place-items-center rounded-lg border border-line bg-surface text-ink-soft transition-colors hover:text-ink"
    >
      {isDark ? <Sun size={15} /> : <Moon size={15} />}
    </button>
  )
}
