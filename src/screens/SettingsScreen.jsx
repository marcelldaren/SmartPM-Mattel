import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Check, Cloud, HardDrive, LoaderCircle, Save, ShieldCheck, TriangleAlert, Wifi, WifiOff,
} from 'lucide-react'
import { Btn, Card, ScreenHeader } from '../components/ui'
import { fmtIDR } from '../data'
import { api } from '../lib/api'
import { useToast } from '../lib/toast'

const PROVIDERS = [
  {
    id: 'ollama',
    label: 'Local (Ollama)',
    desc: 'Runs 100% on this machine. Private, offline, free. Fast but terser output.',
    icon: HardDrive,
  },
  {
    id: 'gemini',
    label: 'Gemini (cloud)',
    desc: 'Google Gemini API. Higher-quality drafting & reasoning. Sends data to the cloud.',
    icon: Cloud,
  },
]

export default function SettingsScreen() {
  const toast = useToast()
  const queryClient = useQueryClient()
  const { data, isLoading } = useQuery({ queryKey: ['settings'], queryFn: api.settings })

  const [threshold, setThreshold] = useState('')
  useEffect(() => {
    if (data?.approvalThresholdIdr != null) setThreshold(String(data.approvalThresholdIdr))
  }, [data?.approvalThresholdIdr])

  const save = useMutation({
    mutationFn: api.updateSettings,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })

  const setProvider = (chatProvider) => {
    if (chatProvider === data?.chatProvider) return
    save.mutate(
      { chatProvider },
      {
        onSuccess: () =>
          toast(
            chatProvider === 'gemini' ? 'Switched to Gemini (cloud)' : 'Switched to the local model',
            'success',
          ),
        onError: (e) => toast(e.message || 'Could not switch provider', 'error'),
      },
    )
  }

  const saveThreshold = () => {
    const n = Number(threshold)
    if (!Number.isFinite(n) || n < 0) {
      toast('Enter a valid amount', 'error')
      return
    }
    save.mutate(
      { approvalThresholdIdr: Math.round(n) },
      {
        onSuccess: () => toast(`Auto-send threshold set to ${fmtIDR(Math.round(n))}`, 'success'),
        onError: (e) => toast(e.message || 'Could not save threshold', 'error'),
      },
    )
  }

  if (isLoading) {
    return (
      <>
        <ScreenHeader title="Settings" sub="Plant-wide configuration." />
        <div className="grid place-items-center py-16">
          <LoaderCircle size={22} className="animate-spin text-primary" />
        </div>
      </>
    )
  }

  const ai = data?.ai ?? {}
  const provider = data?.chatProvider ?? 'ollama'
  const geminiSelectedNoKey = provider === 'gemini' && !ai.geminiKeyPresent

  return (
    <>
      <ScreenHeader title="Settings" sub="Plant-wide configuration for AI and approvals." />

      <div className="space-y-6">
        {/* AI engine */}
        <Card className="p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold">AI engine</h2>
              <p className="mt-0.5 text-xs text-ink-faint">
                Which model powers drafting, search, insights, the assistant, and reports.
              </p>
            </div>
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ${
                ai.reachable ? 'bg-success-50 text-success' : 'bg-accent-50 text-accent-700'
              }`}
            >
              {ai.reachable ? <Wifi size={12} /> : <WifiOff size={12} />}
              {ai.reachable ? 'AI service online' : 'AI service offline'}
            </span>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {PROVIDERS.map((p) => {
              const active = provider === p.id
              const Icon = p.icon
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setProvider(p.id)}
                  disabled={save.isPending}
                  className={`cursor-pointer rounded-lg border p-4 text-left transition-all disabled:opacity-60 ${
                    active
                      ? 'border-primary bg-primary-50 ring-2 ring-primary/15'
                      : 'border-line bg-surface hover:border-neutral-300'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Icon size={16} className={active ? 'text-primary' : 'text-ink-soft'} />
                    <span className="text-sm font-semibold">{p.label}</span>
                    {active && <Check size={15} className="ml-auto text-primary" />}
                  </div>
                  <p className="mt-1.5 text-xs leading-relaxed text-ink-faint">{p.desc}</p>
                </button>
              )
            })}
          </div>

          {geminiSelectedNoKey && (
            <div className="mt-3 flex items-start gap-2 rounded-lg border border-accent-100 bg-accent-50 p-3 text-xs text-accent-700">
              <TriangleAlert size={14} className="mt-0.5 shrink-0" />
              <p>
                Gemini is selected but no API key is set. Add <code className="font-mono">GEMINI_API_KEY</code> to{' '}
                <code className="font-mono">ai-service/.env</code> and restart the AI service, or switch back to
                Local.
              </p>
            </div>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-1 border-t border-line/60 pt-3 text-xs text-ink-faint">
            <span>
              Active chat model: <span className="font-medium text-ink">{ai.chatModel ?? '—'}</span>
            </span>
            <span>
              Embeddings: <span className="font-medium text-ink">{ai.embedModel ?? '—'}</span> (always local)
            </span>
          </div>
        </Card>

        {/* Approval threshold */}
        <Card className="p-5">
          <div className="flex items-center gap-2">
            <ShieldCheck size={16} className="text-success" />
            <h2 className="text-sm font-bold">Auto-send threshold</h2>
          </div>
          <p className="mt-1 text-xs text-ink-faint">
            Part requests below this cost are auto-sent to the vendor; at or above it, they wait for supervisor
            approval.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <div className="flex items-center rounded-lg border border-line bg-surface pl-3 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/15">
              <span className="text-sm text-ink-faint">Rp</span>
              <input
                type="number"
                min="0"
                step="50000"
                value={threshold}
                onChange={(e) => setThreshold(e.target.value)}
                className="readout h-9 w-40 bg-transparent px-2 text-sm outline-none"
              />
            </div>
            <Btn
              onClick={saveThreshold}
              disabled={save.isPending || threshold === String(data?.approvalThresholdIdr ?? '')}
            >
              <Save size={15} /> Save
            </Btn>
            <span className="text-xs text-ink-faint">
              Currently <span className="font-medium text-ink">{fmtIDR(data?.approvalThresholdIdr ?? 0)}</span>
            </span>
          </div>
        </Card>
      </div>
    </>
  )
}
