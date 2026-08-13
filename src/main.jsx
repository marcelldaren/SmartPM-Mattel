import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import './index.css'
import App from './App.jsx'
import { AuthProvider } from './lib/auth'
import { ToastProvider } from './lib/toast'
import { ThemeProvider } from './lib/theme'
import { I18nProvider } from './lib/i18n'

const queryClient = new QueryClient()

// Theme and language sit outermost: they are pure UI preferences with no dependency on
// auth or data, and everything below them (including the login screen) needs both.
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ThemeProvider>
      <I18nProvider>
        <QueryClientProvider client={queryClient}>
          <ToastProvider>
            <AuthProvider>
              <App />
            </AuthProvider>
          </ToastProvider>
        </QueryClientProvider>
      </I18nProvider>
    </ThemeProvider>
  </StrictMode>,
)
