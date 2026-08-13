import { createContext, useCallback, useContext, useState } from 'react'
import { CircleCheck, Info, TriangleAlert, X } from 'lucide-react'

const ToastContext = createContext(null)

let nextId = 0

const TONES = {
  success: { icon: CircleCheck, cls: 'border-success-100 bg-success-50 text-success' },
  error: { icon: TriangleAlert, cls: 'border-accent-100 bg-accent-50 text-accent-700' },
  info: { icon: Info, cls: 'border-primary-100 bg-primary-50 text-primary' },
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const dismiss = useCallback((id) => setToasts((t) => t.filter((x) => x.id !== id)), [])

  const toast = useCallback(
    (message, tone = 'success', ttl = 4000) => {
      const id = ++nextId
      setToasts((t) => [...t, { id, message, tone }])
      if (ttl) setTimeout(() => dismiss(id), ttl)
      return id
    },
    [dismiss],
  )

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className="pointer-events-none fixed bottom-5 right-5 z-50 flex w-80 max-w-[calc(100vw-2.5rem)] flex-col gap-2">
        {toasts.map((t) => {
          const { icon: Icon, cls } = TONES[t.tone] ?? TONES.info
          return (
            <div
              key={t.id}
              className={`animate-rise pointer-events-auto flex items-start gap-2.5 rounded-lg border p-3 shadow-sm ${cls}`}
            >
              <Icon size={17} className="mt-0.5 shrink-0" />
              <p className="flex-1 text-[13px] font-medium leading-snug">{t.message}</p>
              <button
                type="button"
                onClick={() => dismiss(t.id)}
                className="shrink-0 cursor-pointer rounded p-0.5 opacity-60 transition-opacity hover:opacity-100"
              >
                <X size={14} />
              </button>
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within a ToastProvider')
  return ctx
}
