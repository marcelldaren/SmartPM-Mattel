import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { LoaderCircle, Menu, Wrench } from 'lucide-react'
import Sidebar from './components/Sidebar'
import Dashboard from './screens/Dashboard'
import Checksheet from './screens/Checksheet'
import SearchScreen from './screens/SearchScreen'
import Approvals from './screens/Approvals'
import InsightsScreen from './screens/InsightsScreen'
import AssistantScreen from './screens/AssistantScreen'
import ReportsScreen from './screens/ReportsScreen'
import SettingsScreen from './screens/SettingsScreen'
import InventoryScreen from './screens/InventoryScreen'
import LoginScreen from './screens/LoginScreen'
import { useAuth } from './lib/auth'
import { api } from './lib/api'

export default function App() {
  const { user, isLoading } = useAuth()
  const [screen, setScreen] = useState('dashboard')
  const [navOpen, setNavOpen] = useState(false)

  const { data } = useQuery({
    queryKey: ['dashboard'],
    queryFn: api.dashboard,
    enabled: !!user,
  })

  // Drives the sidebar badge — parts waiting to be collected from the storeroom.
  const { data: pulls = [] } = useQuery({
    queryKey: ['pullRequests'],
    queryFn: api.pullRequests,
    enabled: !!user,
  })

  if (isLoading) {
    return (
      <div className="grid min-h-screen place-items-center bg-page">
        <LoaderCircle size={24} className="animate-spin text-primary" />
      </div>
    )
  }

  if (!user) return <LoginScreen />

  const sheets = data?.sheets ?? []
  const findings = data?.findings ?? []
  const approvals = data?.approvals ?? []
  const trend = data?.trend ?? []
  const pendingCount = approvals.filter((a) => a.status === 'pending').length
  const pickupCount = pulls.filter((p) => p.status === 'pending_pickup').length

  const screens = {
    dashboard: <Dashboard sheets={sheets} findings={findings} approvals={approvals} trend={trend} go={setScreen} />,
    checksheet: <Checksheet go={setScreen} />,
    search: <SearchScreen />,
    assistant: <AssistantScreen />,
    insights: <InsightsScreen />,
    reports: <ReportsScreen />,
    approvals: <Approvals />,
    inventory: <InventoryScreen />,
    settings: <SettingsScreen />,
  }

  return (
    <div className="flex min-h-screen bg-page text-ink">
      <Sidebar
        screen={screen}
        go={setScreen}
        pendingCount={pendingCount}
        pickupCount={pickupCount}
        open={navOpen}
        onClose={() => setNavOpen(false)}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile-only chrome: the sidebar is off-canvas below `lg`, so navigation needs a
            way back. Hidden entirely on desktop, where the rail is always visible. */}
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-line bg-surface px-4 py-2.5 lg:hidden">
          <button
            type="button"
            onClick={() => setNavOpen(true)}
            aria-label="Open menu"
            className="grid size-9 cursor-pointer place-items-center rounded-lg text-ink-soft transition-colors hover:bg-neutral-100 hover:text-ink"
          >
            <Menu size={20} />
          </button>
          <div className="flex min-w-0 items-center gap-2">
            <div className="grid size-7 shrink-0 place-items-center rounded-md bg-primary text-white">
              <Wrench size={15} />
            </div>
            <span className="truncate text-sm font-bold tracking-tight">SmartPM</span>
          </div>
          {pendingCount > 0 && (
            <span className="ml-auto grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-accent px-1.5 text-[11px] font-semibold text-white">
              {pendingCount}
            </span>
          )}
        </header>

        <main className="min-w-0 flex-1">
          <div
            key={screen}
            className="animate-rise mx-auto max-w-6xl px-4 py-5 sm:px-6 sm:py-6 lg:px-8 lg:py-8"
          >
            {screens[screen]}
          </div>
        </main>
      </div>
    </div>
  )
}
