import { createContext, useContext, useEffect, useState } from 'react'

/**
 * Light/dark theme.
 *
 * Writes `data-theme` on <html>; the actual colours live in index.css as token overrides,
 * so no component needs to know which theme is active. Persisted to localStorage and
 * seeded from the OS preference on first visit, so a technician who runs their phone in
 * dark mode doesn't get a white flash on every shift.
 */

const ThemeContext = createContext(null)
const STORAGE_KEY = 'smartpm.theme'

function initialTheme() {
  if (typeof window === 'undefined') return 'light'
  const stored = window.localStorage.getItem(STORAGE_KEY)
  if (stored === 'light' || stored === 'dark') return stored
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(initialTheme)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    try {
      window.localStorage.setItem(STORAGE_KEY, theme)
    } catch {
      // Private browsing can reject writes; the theme still applies for this session.
    }
  }, [theme])

  const value = {
    theme,
    isDark: theme === 'dark',
    toggleTheme: () => setTheme((t) => (t === 'dark' ? 'light' : 'dark')),
  }
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  return useContext(ThemeContext) ?? { theme: 'light', isDark: false, toggleTheme: () => {} }
}
