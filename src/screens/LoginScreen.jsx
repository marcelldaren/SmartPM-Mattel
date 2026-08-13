import { useState } from 'react'
import { LoaderCircle, Lock, TriangleAlert, User, Wrench } from 'lucide-react'
import { Btn, Card } from '../components/ui'
import { useAuth } from '../lib/auth'

export default function LoginScreen() {
  const { login, loginError, loggingIn } = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')

  const submit = (e) => {
    e.preventDefault()
    login({ username, password })
  }

  return (
    <div className="grid min-h-screen place-items-center bg-page px-4">
      <Card className="animate-rise w-full max-w-sm p-8">
        <div className="flex items-center gap-2.5">
          <div className="grid size-9 place-items-center rounded-lg bg-primary text-white">
            <Wrench size={18} />
          </div>
          <div className="leading-tight">
            <div className="text-[15px] font-bold tracking-tight">SmartPM</div>
            <div className="text-[11px] text-ink-faint">PT Mattel Indonesia</div>
          </div>
        </div>

        <h1 className="mt-6 text-xl font-bold tracking-tight">Sign in</h1>
        <p className="mt-1 text-sm text-ink-soft">Use your supervisor or technician account.</p>

        <form onSubmit={submit} className="mt-5 space-y-3">
          <div>
            <label className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-ink-soft">
              <User size={13} /> Username
            </label>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoFocus
              className="h-10 w-full rounded-lg border border-line bg-surface px-3 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/15"
            />
          </div>
          <div>
            <label className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-ink-soft">
              <Lock size={13} /> Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-10 w-full rounded-lg border border-line bg-surface px-3 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/15"
            />
          </div>

          {loginError && (
            <p className="flex items-center gap-1.5 text-xs font-medium text-accent-700">
              <TriangleAlert size={13} /> {loginError.message}
            </p>
          )}

          <Btn type="submit" className="h-10 w-full" disabled={loggingIn || !username || !password}>
            {loggingIn ? (
              <>
                <LoaderCircle size={16} className="animate-spin" /> Signing in…
              </>
            ) : (
              'Sign in'
            )}
          </Btn>
        </form>
      </Card>
    </div>
  )
}
