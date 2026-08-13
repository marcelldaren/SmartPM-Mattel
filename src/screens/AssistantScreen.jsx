import { useEffect, useRef, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { LoaderCircle, Send, Sparkles } from 'lucide-react'
import { Btn, Card, ScreenHeader } from '../components/ui'
import { ToolChips, ToolResult } from '../components/toolResults'
import { api } from '../lib/api'
import { useI18n } from '../lib/i18n'

/**
 * The assistant's own mark: a hex nut enclosing a pulse trace — maintenance hardware plus a
 * live signal. Deliberately not a generic robot face; this agent reads plant data, it
 * doesn't pretend to be a person.
 */
function AssistantMark({ size = 18, className = '' }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M12 2.6 20.1 7.3v9.4L12 21.4 3.9 16.7V7.3z" />
      <path d="M7.2 12.3h2.1l1.5-3.4 2.4 6.2 1.5-2.8h2.1" />
    </svg>
  )
}

/** Shared avatar chrome so the empty state, every turn, and the spinner match. */
function Avatar({ size = 'size-8' }) {
  return (
    <div
      className={`blueprint-grid grid ${size} shrink-0 place-items-center rounded-lg border border-steel-800 bg-steel-900 text-primary-200`}
    >
      <AssistantMark />
    </div>
  )
}

const SUGGESTIONS = [
  'What keeps breaking down lately?',
  'Give me a status update on CNC Mill #3',
  'What part requests are waiting for approval?',
  'Any recurring problems I should worry about?',
]

export default function AssistantScreen() {
  const { t } = useI18n()
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const scrollRef = useRef(null)

  const chat = useMutation({
    mutationFn: (history) => api.assistant(history),
    onSuccess: (res) => {
      setMessages((m) => [
        ...m,
        {
          role: 'assistant',
          content: res.answer,
          toolsUsed: res.toolsUsed ?? [],
          toolCalls: res.toolCalls ?? [],
        },
      ])
    },
    onError: (err) => {
      setMessages((m) => [
        ...m,
        { role: 'assistant', content: `Something went wrong: ${err.message}`, toolsUsed: [], toolCalls: [], error: true },
      ])
    },
  })

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, chat.isPending])

  const send = (text) => {
    const content = text.trim()
    if (!content || chat.isPending) return
    const next = [...messages, { role: 'user', content }]
    setMessages(next)
    setInput('')
    // Send only the role/content pairs the API expects (drop UI-only fields).
    chat.mutate(next.map((m) => ({ role: m.role, content: m.content })))
  }

  return (
    <div className="flex h-[calc(100dvh-9.5rem)] flex-col lg:h-[calc(100vh-4rem)]">
      <ScreenHeader title={t('asst.title')} sub={t('asst.sub')} />

      <Card className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div ref={scrollRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
          {messages.length === 0 && !chat.isPending && (
            <div className="grid h-full place-items-center text-center">
              <div>
                <div className="mx-auto w-fit">
                  <Avatar size="size-12" />
                </div>
                <p className="mt-4 text-sm font-medium">{t('asst.emptyTitle')}</p>
                <p className="mx-auto mt-1.5 max-w-sm text-xs leading-relaxed text-ink-faint">
                  It can search records, check recurring issues, look up a machine's status, and review the
                  approval queue — then answer in plain language.
                </p>
                <div className="mx-auto mt-5 flex max-w-md flex-wrap justify-center gap-2">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => send(s)}
                      className="cursor-pointer rounded-full border border-line bg-surface px-3 py-1.5 text-xs font-medium text-ink-soft transition-colors hover:border-primary-200 hover:text-primary"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {messages.map((m, i) =>
            m.role === 'user' ? (
              <div key={i} className="flex justify-end">
                <div className="max-w-[80%] rounded-2xl rounded-br-sm bg-primary px-4 py-2.5 text-sm text-white">
                  {m.content}
                </div>
              </div>
            ) : (
              <div key={i} className="flex gap-2.5">
                <Avatar />
                <div className="min-w-0 max-w-[85%] flex-1 space-y-2">
                  {/* What it ran, then what came back, then what it concluded — the chips
                      and panels carry matching icons so the tool use is legible at a glance. */}
                  <ToolChips names={m.toolsUsed} />
                  {m.toolCalls?.map((call, ci) => (
                    <ToolResult key={ci} call={call} />
                  ))}
                  <div
                    className={`whitespace-pre-line rounded-2xl rounded-tl-sm border px-4 py-2.5 text-sm leading-relaxed ${
                      m.error ? 'border-accent-100 bg-accent-50 text-accent-700' : 'border-line bg-surface text-ink'
                    }`}
                  >
                    {m.content}
                  </div>
                </div>
              </div>
            ),
          )}

          {chat.isPending && (
            <div className="flex gap-2.5">
              <Avatar />
              <div className="flex items-center gap-2 rounded-2xl rounded-tl-sm border border-line bg-surface px-4 py-2.5 text-sm text-ink-faint">
                <LoaderCircle size={14} className="animate-spin text-primary" /> {t('asst.thinking')}
              </div>
            </div>
          )}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault()
            send(input)
          }}
          className="flex items-center gap-3 border-t border-line bg-surface p-3"
        >
          <div className="flex flex-1 items-center gap-2.5 rounded-lg border border-line px-3.5 py-1 transition-all focus-within:border-primary focus-within:ring-4 focus-within:ring-primary/10">
            <Sparkles size={16} className="shrink-0 text-primary" />
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={chat.isPending}
              placeholder={t('asst.placeholder')}
              className="h-9 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-ink-faint"
            />
          </div>
          <Btn type="submit" disabled={chat.isPending || !input.trim()}>
            <Send size={15} /> {t('asst.send')}
          </Btn>
        </form>
      </Card>
    </div>
  )
}
