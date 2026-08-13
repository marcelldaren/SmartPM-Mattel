import { useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowRight, CalendarClock, Camera, Check, CircleCheck, FileText,
  History, ImagePlus, LoaderCircle, Mail, MapPin, PackageCheck, RotateCcw, ScanLine,
  Sparkles, TriangleAlert, Warehouse, X,
} from 'lucide-react'
import { Btn, Card, ScreenHeader, Select, StatusBadge } from '../components/ui'
import { iconForMachine } from '../components/machineIcons'
import { ChecklistArt, EmptyState } from '../components/EmptyState'
import { VerificationBadge } from '../components/VerificationBadge'
import ScanChecksheet from '../components/ScanChecksheet'
import { FINDING_CATEGORIES, PART_REQUEST_CATEGORIES, fmtIDR } from '../data'
import { api } from '../lib/api'
import { useI18n } from '../lib/i18n'
import { readImageForUpload } from '../lib/image'
import { useAuth } from '../lib/auth'
import { useToast } from '../lib/toast'

const DUE_TONES = {
  primary: 'bg-primary-50 text-primary',
  accent: 'bg-accent-50 text-accent-700',
  neutral: 'bg-neutral-100 text-ink-soft',
}

const todayLabel = new Date().toLocaleDateString('en-GB', {
  weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
})

export default function Checksheet({ go }) {
  const { t, tv, tDue } = useI18n()
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const toast = useToast()

  const { data: machines = [] } = useQuery({ queryKey: ['machines'], queryFn: api.machines })
  const { data: technicians = [] } = useQuery({ queryKey: ['technicians'], queryFn: api.technicians })

  const [machineId, setMachineId] = useState('')
  const [technicianId, setTechnicianId] = useState('')
  const [answers, setAnswers] = useState({})
  const [cats, setCats] = useState({})
  const [photos, setPhotos] = useState([])
  // Real evidence photos keyed by checklist item id — these carry actual image bytes.
  const [itemPhotos, setItemPhotos] = useState({})
  const [result, setResult] = useState(null)

  // --- Paper scan (pre-fill only) --------------------------------------------------
  const [scanOpen, setScanOpen] = useState(false)
  // { [checklistItemId]: { result: bool, category: bool } } — drives the amber outline.
  const [lowConf, setLowConf] = useState({})
  const [scanMeta, setScanMeta] = useState(null)

  /** Marks a field as reviewed so its amber outline clears the moment it's touched. */
  const clearLow = (id, field) =>
    setLowConf((m) => (m[id]?.[field] ? { ...m, [id]: { ...m[id], [field]: false } } : m))

  const machine = machines.find((m) => String(m.id) === String(machineId))
  const items = machine?.checklist ?? []

  const activeTechId = user.role === 'technician' ? user.id : technicianId ? Number(technicianId) : ''
  const activeTech = technicians.find((t) => t.id === activeTechId)
  const techName = user.role === 'technician' ? user.displayName : activeTech?.displayName ?? ''
  const vendor = activeTech?.vendorName ?? ''

  const answered = items.filter((it) => answers[it.id]).length
  const failItems = items.filter((it) => answers[it.id] === 'fail')
  const missingCats = failItems.filter((it) => !cats[it.id]).length
  const requestCount = failItems.filter((it) => PART_REQUEST_CATEGORIES.includes(cats[it.id])).length
  const canSubmit = machine && activeTechId && answered === items.length && missingCats === 0

  const pickMachine = (id) => {
    setMachineId(id)
    setAnswers({})
    setCats({})
    setItemPhotos({})
    // Choosing a different machine invalidates a scanned draft — its rows belonged to
    // the old machine's checklist.
    setLowConf({})
    setScanMeta(null)
  }

  /**
   * Apply a scanned draft to the form. This only seeds the same state the technician
   * would have set by hand — there is no separate "scanned" mode and no separate submit.
   * `pickMachine` is deliberately not used here: it clears answers, which would wipe the
   * rows we are about to fill.
   */
  const applyScan = (prefill, previewUrl) => {
    setMachineId(prefill.machineId ? String(prefill.machineId) : '')
    setTechnicianId(prefill.technicianUserId ? String(prefill.technicianUserId) : '')

    const nextAnswers = {}
    const nextCats = {}
    const nextLow = {}
    for (const a of prefill.answers) {
      if (a.result) nextAnswers[a.checklistItemId] = a.result
      if (a.category) nextCats[a.checklistItemId] = a.category
      nextLow[a.checklistItemId] = { result: a.lowConfidenceResult, category: a.lowConfidenceCategory }
    }
    setAnswers(nextAnswers)
    setCats(nextCats)
    setItemPhotos({})
    setLowConf(nextLow)
    setScanMeta({
      previewUrl,
      paperDate: prefill.paperDate,
      warnings: prefill.warnings ?? [],
      model: prefill.model,
      deskewed: prefill.deskewed,
      // The paper marks "photo attached" per row, but the physical print is a separate
      // file in this simulation — the technician still attaches it here by hand.
      photoRows: prefill.answers.filter((a) => a.photoAttached).map((a) => a.label),
      lowCount: prefill.answers.filter((a) => a.lowConfidenceResult || a.lowConfidenceCategory).length,
    })
    toast(t('scan.applied'), 'success')
  }

  const setAnswer = (id, val) => {
    clearLow(id, 'result')
    setAnswers((a) => ({ ...a, [id]: val }))
    if (val === 'pass') {
      setCats((c) => ({ ...c, [id]: undefined }))
      // Drop any evidence photo too — it was attached to a failure that no longer exists.
      setItemPhotos((m) => {
        const next = { ...m }
        delete next[id]
        return next
      })
    }
  }

  const addPhotos = (names) => {
    const list = names?.length ? names : [`IMG_${Math.floor(1000 + Math.random() * 9000)}.jpg`]
    setPhotos((p) =>
      [...p, ...list.map((name) => ({ name, size: `${(1 + Math.random() * 3.5).toFixed(1)} MB` }))].slice(0, 6),
    )
  }

  const submitMutation = useMutation({
    mutationFn: (payload) => api.submitChecksheet(payload),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      queryClient.invalidateQueries({ queryKey: ['partRequests'] })
      queryClient.invalidateQueries({ queryKey: ['insights'] })
      const n = data.requests?.length ?? 0
      const pulled = data.pulls?.length ?? 0
      const parts = [
        pulled ? `${pulled} part${pulled > 1 ? 's' : ''} reserved from stock` : '',
        n ? `${n} vendor request${n > 1 ? 's' : ''} drafted` : '',
      ].filter(Boolean)
      toast(`${data.sheet.id} submitted${parts.length ? ` · ${parts.join(' · ')}` : ''}`, 'success')
      setResult({
        sheet: { id: data.sheet.id, machine: data.sheet.machine, status: data.sheet.status, tech: techName },
        requests: data.requests,
        pulls: data.pulls ?? [],
        verifications: data.verifications ?? [],
        passCount: items.length - failItems.length,
        failCount: failItems.length,
      })
    },
    onError: (e) => toast(e.message || 'Submission failed', 'error'),
  })

  const submit = () => {
    submitMutation.mutate({
      machineId: Number(machineId),
      technicianUserId: user.role === 'supervisor' ? Number(technicianId) : undefined,
      answers: items.map((it) => {
        const photo = itemPhotos[it.id]
        return {
          checklistItemId: it.id,
          result: answers[it.id],
          category: cats[it.id] ?? null,
          // previewUrl is display-only; the API takes bare base64.
          photo: photo
            ? { name: photo.name, mime: photo.mime, data: photo.data, thumbnail: photo.thumbnail }
            : null,
        }
      }),
    })
  }

  const reset = () => {
    setMachineId('')
    setTechnicianId('')
    setAnswers({})
    setCats({})
    setPhotos([])
    setItemPhotos({})
    setResult(null)
    setLowConf({})
    setScanMeta(null)
    submitMutation.reset()
  }

  if (result) return <SuccessView result={result} reset={reset} go={go} />

  const hint = !machine
    ? 'Select a machine to begin'
    : !activeTechId
      ? 'Select a technician'
      : answered < items.length
        ? `${items.length - answered} of ${items.length} inspection points remaining`
        : missingCats > 0
          ? `Select a finding category for ${missingCats} failed point${missingCats > 1 ? 's' : ''}`
          : `Ready — will be signed as ${techName}`

  return (
    <>
      <ScreenHeader title={t('cs.title')} sub={t('cs.sub')}>
        <Btn variant="outline" onClick={() => setScanOpen(true)}>
          <ScanLine size={15} /> {t('scan.entry')}
        </Btn>
        <span className="hidden items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-1.5 text-xs font-medium text-ink-soft sm:flex">
          <FileText size={13} /> PM-STD-06 · Rev 4
        </span>
        <span className="hidden rounded-lg border border-line bg-surface px-3 py-1.5 text-xs font-medium text-ink-soft sm:block">
          {todayLabel}
        </span>
      </ScreenHeader>

      <ScanChecksheet open={scanOpen} onClose={() => setScanOpen(false)} onApply={applyScan} />

      {scanMeta && <ScanReviewBanner meta={scanMeta} onDismiss={() => setScanMeta(null)} />}

      <div className="grid items-start gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {/* Work order */}
          <Card className="p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-[15px] font-semibold">{t('cs.workOrder')}</h2>
              <span className="text-xs font-medium text-ink-faint">{t('cs.autoAssigned')}</span>
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-ink-soft">{t('cs.machine')}</label>
                <Select value={machineId} onChange={(e) => pickMachine(e.target.value)} placeholder={t('cs.selectMachine')}>
                  {machines.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} — {m.code}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-ink-soft">{t('cs.technician')}</label>
                {user.role === 'technician' ? (
                  <div className="flex h-10 items-center rounded-lg border border-line bg-neutral-50 px-3 text-sm font-medium text-ink-soft">
                    {user.displayName}
                  </div>
                ) : (
                  <Select value={technicianId} onChange={(e) => setTechnicianId(e.target.value)} placeholder={t('cs.selectTechnician')}>
                    {technicians.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.displayName} — {t.vendorName}
                      </option>
                    ))}
                  </Select>
                )}
              </div>
            </div>
            {machine && (
              <div className="animate-rise mt-4 flex items-start gap-3">
                {/* Same schematic glyph the dashboard floor map uses — a technician should
                    recognize the machine by shape before reading its code. */}
                <div className="blueprint-grid grid size-14 shrink-0 place-items-center rounded-lg border border-steel-800 bg-steel-900 text-primary-200">
                  {(() => {
                    const MachineIcon = iconForMachine(`${machine.name} ${machine.code}`)
                    return <MachineIcon size={28} title={machine.name} />
                  })()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="readout text-xs text-ink-faint">{machine.code}</p>
                  <div className="mt-1.5 flex flex-wrap gap-2">
                    <MetaChip icon={MapPin} text={machine.area} />
                    <MetaChip icon={History} text={`Last PM ${machine.lastPmDate}`} />
                    <MetaChip icon={CalendarClock} text={machine.pmIntervalLabel} />
                    <span className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium ${DUE_TONES[machine.dueTone]}`}>
                      {tDue(machine.due, machine.dueLabel)}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </Card>

          {/* Inspection points */}
          <Card className="p-6">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2.5">
                <h2 className="text-[15px] font-semibold">{t('cs.inspectionPoints')}</h2>
                {failItems.length > 0 && (
                  <span className="flex items-center gap-1 rounded-full bg-accent-50 px-2 py-0.5 text-[11px] font-semibold text-accent-700">
                    <TriangleAlert size={11} />
                    {failItems.length} finding{failItems.length > 1 ? 's' : ''}
                  </span>
                )}
              </div>
              {machine && (
                <div className="flex items-center gap-2.5">
                  <span className="readout text-xs font-medium text-ink-faint">
                    {answered}/{items.length}
                  </span>
                  <div className="h-1.5 w-24 overflow-hidden rounded-full bg-neutral-200/70">
                    <div
                      className="h-full rounded-full bg-primary transition-[width] duration-300"
                      style={{ width: `${items.length ? (answered / items.length) * 100 : 0}%` }}
                    />
                  </div>
                </div>
              )}
            </div>

            {!machine ? (
              <EmptyState
                art={ChecklistArt}
                className="py-8"
                title={t('cs.emptyTitle')}
                body={t('cs.emptyBody')}
              />
            ) : (
              <ul className="mt-2 divide-y divide-line/60">
                {items.map((it, idx) => {
                  const a = answers[it.id]
                  const low = lowConf[it.id] ?? {}
                  return (
                    <li key={it.id} className="py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex min-w-0 flex-1 items-start gap-2.5">
                          <span className="readout w-6 pt-0.5 text-[11px] font-semibold text-ink-faint">
                            {String(idx + 1).padStart(2, '0')}
                          </span>
                          <div className="min-w-0">
                            <p className="text-sm font-medium leading-snug">{it.label}</p>
                            <p className="mt-0.5 text-xs text-ink-faint">{it.hint}</p>
                            {low.result && <LowConfidenceNote label={t('scan.checkThis')} />}
                          </div>
                        </div>
                        <div
                          className={`flex shrink-0 items-center gap-0.5 rounded-lg border bg-neutral-50 p-0.5 ${
                            low.result ? 'border-signal-amber ring-2 ring-signal-amber/30' : 'border-line'
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => setAnswer(it.id, 'pass')}
                            className={`flex h-8 cursor-pointer items-center gap-1.5 rounded-md px-3 text-[13px] font-medium transition-colors ${
                              a === 'pass' ? 'bg-success text-white' : 'text-ink-faint hover:bg-surface hover:text-success'
                            }`}
                          >
                            <Check size={15} strokeWidth={2.5} /> Pass
                          </button>
                          <button
                            type="button"
                            onClick={() => setAnswer(it.id, 'fail')}
                            className={`flex h-8 cursor-pointer items-center gap-1.5 rounded-md px-3 text-[13px] font-medium transition-colors ${
                              a === 'fail' ? 'bg-accent text-white' : 'text-ink-faint hover:bg-surface hover:text-accent-700'
                            }`}
                          >
                            <X size={15} strokeWidth={2.5} /> Fail
                          </button>
                        </div>
                      </div>

                      {a === 'fail' && (
                        <div className="animate-rise ml-[34px] mt-3 rounded-lg border border-accent-100 bg-accent-50/60 p-3">
                          <label className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-accent-700">
                            <TriangleAlert size={13} /> {t('cs.findingCategory')}
                          </label>
                          {low.category && <LowConfidenceNote label={t('scan.checkCategory')} className="mb-1.5" />}
                          <Select
                            value={cats[it.id] ?? ''}
                            onChange={(e) => {
                              clearLow(it.id, 'category')
                              setCats((c) => ({ ...c, [it.id]: e.target.value }))
                            }}
                            placeholder={t('cs.selectCategory')}
                            className={`max-w-xs ${low.category ? 'rounded-lg ring-2 ring-signal-amber/40' : ''}`}
                          >
                            {FINDING_CATEGORIES.map((c) => (
                              <option key={c} value={c}>
                                {tv('cat', c)}
                              </option>
                            ))}
                          </Select>
                          {cats[it.id] &&
                            (PART_REQUEST_CATEGORIES.includes(cats[it.id]) ? (
                              <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-accent-700">
                                <Mail size={13} /> {t('cs.willDraft')}
                              </p>
                            ) : (
                              <p className="mt-2 text-xs text-ink-faint">{t('cs.loggedOnly')}</p>
                            ))}

                          {cats[it.id] && (
                            <CheckpointPhoto
                              photo={itemPhotos[it.id]}
                              onPick={(p) => setItemPhotos((m) => ({ ...m, [it.id]: p }))}
                              onClear={() =>
                                setItemPhotos((m) => {
                                  const next = { ...m }
                                  delete next[it.id]
                                  return next
                                })
                              }
                            />
                          )}
                        </div>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </Card>

          {/* Photo evidence */}
          <Card className="p-6">
            <div className="flex items-center gap-2.5">
              <h2 className="text-[15px] font-semibold">{t('cs.generalPhotos')}</h2>
              <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-medium text-ink-faint">
                optional · not AI-checked
              </span>
            </div>
            <div
              onClick={() => addPhotos()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault()
                addPhotos([...(e.dataTransfer?.files ?? [])].map((f) => f.name))
              }}
              className="mt-4 grid cursor-pointer place-items-center rounded-lg border-2 border-dashed border-line p-8 text-center transition-colors hover:border-neutral-400/60 hover:bg-neutral-50"
            >
              <div className="grid size-10 place-items-center rounded-full bg-neutral-100">
                <ImagePlus size={18} className="text-ink-soft" />
              </div>
              <p className="mt-3 text-sm font-medium">{t('cs.dropPhotos')}</p>
              <p className="mt-1 text-xs text-ink-faint">Attach evidence for failed points · JPG/PNG up to 10 MB</p>
            </div>
            {photos.length > 0 && (
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
                {photos.map((p, i) => (
                  <div key={i} className="animate-rise group relative">
                    {/* Evidence is still mocked (no file storage yet), so this is an honest
                        placeholder tile rather than a fake image — it reads as "a photo is
                        attached here" without pretending to show one. */}
                    <div className="blueprint-grid relative grid aspect-[4/3] place-items-center overflow-hidden rounded-lg border border-steel-800 bg-steel-900">
                      <CameraArt />
                      <span className="pointer-events-none absolute left-2 top-2 size-3 border-l border-t border-primary-200/35" />
                      <span className="pointer-events-none absolute right-2 top-2 size-3 border-r border-t border-primary-200/35" />
                      <span className="pointer-events-none absolute bottom-2 left-2 size-3 border-b border-l border-primary-200/35" />
                      <span className="pointer-events-none absolute bottom-2 right-2 size-3 border-b border-r border-primary-200/35" />
                    </div>
                    <p className="readout mt-1.5 truncate text-[11px] font-medium">{p.name}</p>
                    <p className="mt-0.5 flex items-center gap-1 text-[10px] text-ink-faint">
                      <CircleCheck size={11} className="shrink-0 text-success" />
                      {p.size} · uploaded
                    </p>
                    <button
                      type="button"
                      onClick={() => setPhotos((ph) => ph.filter((_, j) => j !== i))}
                      className="absolute -right-1.5 -top-1.5 grid size-5 cursor-pointer place-items-center rounded-full border border-line bg-surface text-ink-faint opacity-0 shadow-xs transition-opacity hover:text-ink group-hover:opacity-100"
                    >
                      <X size={11} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* Summary rail */}
        <div className="space-y-4 lg:sticky lg:top-8">
          <Card className="p-5">
            <h3 className="text-sm font-semibold">{t('cs.summary')}</h3>
            <dl className="mt-3 space-y-2 text-[13px]">
              <SummaryRow label={t('cs.machine')} value={machine?.name} />
              <SummaryRow label={t('cs.technician')} value={techName} />
              <SummaryRow label={t('cs.vendor')} value={vendor} />
              <SummaryRow label={t('cs.date')} value={todayLabel} />
            </dl>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <div className="rounded-lg bg-success-50 p-2.5">
                <div className="readout text-lg font-bold text-success">{answered - failItems.length}</div>
                <div className="text-[11px] font-medium text-success-700/70">{t('cs.passed')}</div>
              </div>
              <div className={`rounded-lg p-2.5 ${failItems.length ? 'bg-accent-50' : 'bg-neutral-100'}`}>
                <div className={`readout text-lg font-bold ${failItems.length ? 'text-accent-700' : 'text-ink-faint'}`}>
                  {failItems.length}
                </div>
                <div className={`text-[11px] font-medium ${failItems.length ? 'text-accent-700/70' : 'text-ink-faint'}`}>
                  Findings
                </div>
              </div>
            </div>
            {requestCount > 0 && (
              <div className="animate-rise mt-3 flex items-start gap-2 rounded-lg bg-primary-50 p-3 text-xs leading-relaxed text-primary">
                <Mail size={14} className="mt-0.5 shrink-0" />
                <span>
                  <b>{requestCount} part request{requestCount > 1 ? 's' : ''}</b> will be drafted by the AI agent and
                  routed to supervisor approval.
                </span>
              </div>
            )}
            {submitMutation.isError && (
              <p className="mt-3 flex items-center gap-1.5 text-xs font-medium text-accent-700">
                <TriangleAlert size={13} /> {submitMutation.error.message}
              </p>
            )}
            <Btn className="mt-4 h-10 w-full" disabled={!canSubmit || submitMutation.isPending} onClick={submit}>
              {submitMutation.isPending ? (
                <>
                  <LoaderCircle size={16} className="animate-spin" /> {t('cs.submitting')}
                </>
              ) : (
                <>
                  {t('cs.submitBtn')} <ArrowRight size={16} />
                </>
              )}
            </Btn>
            <p className="mt-2.5 text-center text-xs text-ink-faint">{hint}</p>
          </Card>
        </div>
      </div>
    </>
  )
}

/**
 * Summary of a scanned draft, shown above the form until dismissed.
 *
 * Its job is to make the scan's limits obvious rather than hide them: what was flagged
 * for review, what could not be matched, and the fact that nothing has been submitted.
 */
function ScanReviewBanner({ meta, onDismiss }) {
  const { t } = useI18n()
  return (
    <Card className="animate-rise mb-5 border-primary-200/70 bg-primary-50/50 p-4">
      <div className="flex items-start gap-3">
        {meta.previewUrl && (
          <img
            src={meta.previewUrl}
            alt={t('scan.preview')}
            className="hidden size-16 shrink-0 rounded-md border border-line object-cover sm:block"
          />
        )}
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-primary">
            <Sparkles size={14} /> {t('scan.bannerTitle')}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-ink-soft">{t('scan.bannerBody')}</p>

          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-ink-faint">
            {meta.paperDate && (
              <span>
                {t('scan.paperDate')}: <b className="readout text-ink-soft">{meta.paperDate}</b>
              </span>
            )}
            {meta.lowCount > 0 && (
              <span className="font-medium text-accent-700">
                {meta.lowCount} {t('scan.flaggedForReview')}
              </span>
            )}
            {!meta.deskewed && <span>{t('scan.noEdgeDetect')}</span>}
            {meta.model && <span className="readout">{meta.model}</span>}
          </div>

          {meta.photoRows.length > 0 && (
            <p className="mt-2 text-[11px] leading-relaxed text-ink-soft">
              {t('scan.photoRows')}: {meta.photoRows.join(', ')}
            </p>
          )}

          {meta.warnings.length > 0 && (
            <ul className="mt-2 space-y-1">
              {meta.warnings.map((w, i) => (
                <li key={i} className="flex items-start gap-1.5 text-[11px] leading-relaxed text-accent-700">
                  <TriangleAlert size={12} className="mt-0.5 shrink-0" />
                  {w}
                </li>
              ))}
            </ul>
          )}
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="shrink-0 cursor-pointer rounded-md p-1.5 text-ink-faint transition-colors hover:bg-neutral-100 hover:text-ink"
          aria-label={t('scan.dismiss')}
        >
          <X size={14} />
        </button>
      </div>
    </Card>
  )
}

function LowConfidenceNote({ label, className = '' }) {
  return (
    <span
      className={`mt-1 inline-flex items-center gap-1 rounded-md bg-signal-amber/15 px-1.5 py-0.5 text-[10px] font-semibold text-signal-amber ${className}`}
    >
      <TriangleAlert size={10} /> {label}
    </span>
  )
}

/**
 * Verification results arrive after the submission has already succeeded, so this polls
 * rather than blocking. It stops the moment nothing is pending — including when the model
 * skipped or failed, which are terminal states, not retries.
 */
function VerificationPanel({ code, expected }) {
  const { data: rows = [] } = useQuery({
    queryKey: ['verifications', code],
    queryFn: () => api.checksheetVerifications(code),
    enabled: expected > 0,
    refetchInterval: (query) => {
      const data = query.state.data
      if (!Array.isArray(data) || data.length === 0) return 2000
      return data.some((v) => v.status === 'pending') ? 2000 : false
    },
  })

  if (!expected) return null

  return (
    <div className="mt-3 space-y-2.5 border-t border-line/60 pt-3">
      <p className="readout text-[9px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
        Photo verification
      </p>
      {rows.length === 0
        ? Array.from({ length: expected }, (_, i) => (
            <VerificationBadge key={i} verification={{ status: 'pending' }} />
          ))
        : rows.map((v) => (
            <div key={v.id}>
              <p className="mb-1 truncate text-[11px] text-ink-faint">
                {v.itemLabel} · claimed “{v.category}”
              </p>
              <VerificationBadge verification={v} />
            </div>
          ))}
      <p className="text-[11px] leading-relaxed text-ink-faint">
        Advisory only — this never changes the finding or blocks the submission.
      </p>
    </div>
  )
}

function SuccessView({ result: r, reset, go }) {
  const { t } = useI18n()
  return (
    <div className="animate-rise mx-auto max-w-md pt-14 text-center">
      <div className="relative mx-auto size-16">
        <div className="absolute inset-0 rounded-full bg-success/25 animate-ring" />
        <div className="animate-pop relative grid size-16 place-items-center rounded-full bg-success text-white">
          <Check size={30} strokeWidth={3} />
        </div>
      </div>
      <h2 className="mt-6 text-2xl font-bold tracking-tight">Checksheet submitted</h2>
      <p className="mt-1.5 text-sm text-ink-soft">
        {r.sheet.id} · {r.sheet.machine} · signed by {r.sheet.tech}
      </p>
      <Card className="mt-6 p-4 text-left">
        <div className="flex items-center justify-between gap-3 text-sm">
          <span className="flex items-center gap-1.5 font-medium text-success">
            <CircleCheck size={16} /> {r.passCount} passed
          </span>
          <span className={`flex items-center gap-1.5 font-medium ${r.failCount ? 'text-accent-700' : 'text-ink-faint'}`}>
            <TriangleAlert size={15} /> {r.failCount} finding{r.failCount === 1 ? '' : 's'}
          </span>
          <StatusBadge status={r.sheet.status} />
        </div>
        {r.pulls?.length > 0 && (
          <div className="mt-3 space-y-2 border-t border-line/60 pt-3">
            <p className="flex items-center gap-1.5 text-[13px] font-semibold text-success">
              <Warehouse size={14} /> {t('cs.inStockTitle')}
            </p>
            {r.pulls.map((pr) => (
              <div key={pr.id} className="flex items-center justify-between gap-3 text-[13px]">
                <span className="flex min-w-0 items-center gap-2">
                  <PackageCheck size={14} className="shrink-0 text-success" />
                  <span className="truncate">
                    {pr.id} — {pr.part}
                  </span>
                </span>
                <span className="readout shrink-0 rounded-md bg-success-50 px-2 py-0.5 text-xs font-semibold text-success">
                  {pr.bin}
                </span>
              </div>
            ))}
            <p className="text-xs text-ink-faint">{t('cs.inStockHint')}</p>
          </div>
        )}
        {r.requests.length > 0 && (
          <div className="mt-3 space-y-2 border-t border-line/60 pt-3">
            {r.requests.map((pr) => (
              <div key={pr.id} className="flex items-center justify-between gap-3 text-[13px]">
                <span className="flex min-w-0 items-center gap-2">
                  <Mail size={14} className="shrink-0 text-primary" />
                  <span className="truncate">
                    {pr.id} — {pr.part}
                  </span>
                </span>
                <span className="readout shrink-0 font-semibold">{fmtIDR(pr.cost)}</span>
              </div>
            ))}
            <p className="text-xs text-ink-faint">Drafted by the AI agent — waiting for supervisor approval.</p>
          </div>
        )}
        <VerificationPanel code={r.sheet.id} expected={r.verifications?.length ?? 0} />
      </Card>
      <div className="mt-6 flex justify-center gap-2">
        <Btn variant="outline" onClick={reset}>
          <RotateCcw size={15} /> New checksheet
        </Btn>
        {r.requests.length > 0 ? (
          <Btn onClick={() => go('approvals')}>
            Review approvals <ArrowRight size={15} />
          </Btn>
        ) : (
          <Btn onClick={() => go('dashboard')}>
            View dashboard <ArrowRight size={15} />
          </Btn>
        )}
      </div>
    </div>
  )
}

/**
 * Real evidence photo for one failed checkpoint — this is the image the AI actually sees.
 * Distinct from the general "Photo evidence" card below, which is still mocked metadata.
 */
function CheckpointPhoto({ photo, onPick, onClear }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef(null)

  const handle = async (file) => {
    if (!file) return
    setBusy(true)
    setError('')
    try {
      onPick(await readImageForUpload(file))
    } catch (err) {
      // Show the real reason: on a phone this is usually an unsupported camera format,
      // and a generic "try a JPG" hides which of several things actually went wrong.
      setError(err?.message ? `Couldn't use that photo — ${err.message}.` : "Couldn't read that image.")
    } finally {
      setBusy(false)
    }
  }

  if (photo) {
    return (
      <div className="mt-3 flex items-center gap-3 rounded-lg border border-line bg-surface p-2.5">
        <img
          src={photo.previewUrl}
          alt="Evidence"
          className="size-16 shrink-0 rounded-md border border-line object-cover"
        />
        <div className="min-w-0 flex-1">
          <p className="readout truncate text-[11px] font-medium">{photo.name}</p>
          <p className="mt-0.5 text-[11px] text-ink-faint">{photo.size} · will be AI-checked after submit</p>
        </div>
        <button
          type="button"
          onClick={onClear}
          className="shrink-0 cursor-pointer rounded-md p-1.5 text-ink-faint transition-colors hover:bg-neutral-100 hover:text-ink"
          aria-label="Remove photo"
        >
          <X size={14} />
        </button>
      </div>
    )
  }

  return (
    <div className="mt-3">
      {/* The input is driven by a ref rather than wrapped in a <label> with `display:none`.
          iOS Safari frequently refuses to open the picker for a display:none file input,
          so it stays in the layout, visually hidden but present. Tap target is >=44px tall
          to meet mobile touch guidance. */}
      <input
        ref={inputRef}
        type="file"
        accept="image/*,.heic,.heif"
        className="absolute size-px overflow-hidden opacity-0"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => {
          handle(e.target.files?.[0])
          e.target.value = ''
        }}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-2 text-xs font-medium text-ink-soft transition-colors hover:border-primary-200 hover:text-primary disabled:opacity-60 sm:min-h-0 sm:py-1.5"
      >
        {busy ? <LoaderCircle size={14} className="animate-spin" /> : <Camera size={14} />}
        {busy ? 'Reading photo…' : 'Attach evidence photo'}
      </button>
      <span className="mt-1 block text-[11px] text-ink-faint sm:ml-2 sm:mt-0 sm:inline">
        optional · checked against this category by AI
      </span>
      {error && <p className="mt-1.5 text-[11px] leading-relaxed text-accent-700">{error}</p>}
    </div>
  )
}

/** Viewfinder glyph for the mocked photo-evidence tiles. */
function CameraArt() {
  return (
    <svg
      viewBox="0 0 48 40"
      className="w-11 text-primary-200/65"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 11h8l3-5h18l3 5h8a2 2 0 0 1 2 2v19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V13a2 2 0 0 1 2-2Z" />
      <circle cx="24" cy="22.5" r="8" />
      <circle cx="24" cy="22.5" r="3.2" />
      <path d="M38.5 15.5h3.5" />
    </svg>
  )
}

function MetaChip({ icon: Icon, text }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md bg-neutral-100 px-2 py-1 text-xs text-ink-soft">
      <Icon size={13} className="text-ink-faint" /> {text}
    </span>
  )
}

function SummaryRow({ label, value }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="shrink-0 text-ink-faint">{label}</dt>
      <dd className={`truncate text-right font-medium ${value ? 'text-ink' : 'text-ink-faint'}`}>{value || '—'}</dd>
    </div>
  )
}
