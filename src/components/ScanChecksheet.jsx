import { useCallback, useEffect, useRef, useState } from 'react'
import { Camera, CircleAlert, ImageUp, LoaderCircle, RotateCcw, ScanLine, X } from 'lucide-react'
import { Btn } from './ui'
import { api } from '../lib/api'
import { useI18n } from '../lib/i18n'
import { readScanFile, readScanFromVideo } from '../lib/image'

/**
 * Capture a paper checksheet and hand the extracted draft back to the form.
 *
 * This component never submits anything. It calls the read-only scan endpoint and passes
 * the resulting draft to `onApply`; the technician then reviews it in the normal digital
 * form and submits through the existing button. Nothing here writes to the database.
 *
 * Camera access needs a secure context (https or localhost). Over plain http on a LAN
 * address `navigator.mediaDevices` is simply undefined, and laptops may have no camera at
 * all — so the file picker is a first-class path, not an error state.
 */

const cameraSupported = () =>
  typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia

export default function ScanChecksheet({ open, onClose, onApply }) {
  const { t } = useI18n()
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const fileRef = useRef(null)

  // idle → camera → captured → scanning → (applied | error)
  const [mode, setMode] = useState('idle')
  const [shot, setShot] = useState(null)
  const [error, setError] = useState('')
  const [failure, setFailure] = useState(null)

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
  }, [])

  const startCamera = useCallback(async () => {
    setError('')
    setFailure(null)
    if (!cameraSupported()) {
      setMode('nocamera')
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        // The rear camera on a phone; ignored by laptops, which have only one.
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 2560 }, height: { ideal: 1440 } },
        audio: false,
      })
      streamRef.current = stream
      setMode('camera')
      // The <video> only exists once mode flips, so attach on the next frame.
      requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          videoRef.current.play?.().catch(() => {})
        }
      })
    } catch {
      // Denied permission, no device, or an insecure context — all land on the picker.
      setMode('nocamera')
    }
  }, [])

  useEffect(() => {
    if (open) {
      setShot(null)
      setError('')
      setFailure(null)
      startCamera()
    } else {
      stopCamera()
      setMode('idle')
    }
    return stopCamera
  }, [open, startCamera, stopCamera])

  if (!open) return null

  const capture = () => {
    try {
      const frame = readScanFromVideo(videoRef.current)
      stopCamera()
      setShot(frame)
      setMode('captured')
    } catch (err) {
      setError(err?.message || t('scan.captureFailed'))
    }
  }

  const pickFile = async (file) => {
    if (!file) return
    setError('')
    try {
      const frame = await readScanFile(file)
      stopCamera()
      setShot(frame)
      setMode('captured')
    } catch (err) {
      setError(err?.message || t('scan.readFailed'))
    }
  }

  const send = async () => {
    if (!shot) return
    setMode('scanning')
    setError('')
    setFailure(null)
    try {
      const res = await api.scanChecksheet(shot.data)
      if (!res.ok) {
        setFailure(res)
        setMode('captured')
        return
      }
      onApply(res, shot.previewUrl)
      onClose()
    } catch (err) {
      setError(err?.message || t('scan.failed'))
      setMode('captured')
    }
  }

  const retake = () => {
    setShot(null)
    setFailure(null)
    setError('')
    startCamera()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={t('scan.title')}
    >
      <div className="flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-steel-800 bg-steel-900 text-white shadow-2xl">
        <header className="flex items-center gap-2.5 border-b border-steel-800 px-4 py-3">
          <ScanLine size={17} className="text-primary-200" />
          <h2 className="flex-1 text-sm font-semibold">{t('scan.title')}</h2>
          <button
            type="button"
            onClick={onClose}
            className="grid size-8 cursor-pointer place-items-center rounded-md text-white/60 transition-colors hover:bg-white/10 hover:text-white"
            aria-label={t('scan.close')}
          >
            <X size={16} />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {mode === 'camera' && (
            <div className="relative bg-black">
              <video
                ref={videoRef}
                playsInline
                muted
                autoPlay
                className="block max-h-[52dvh] w-full object-contain"
              />
              <AlignmentGuide label={t('scan.align')} />
            </div>
          )}

          {mode === 'nocamera' && (
            <div className="px-4 py-8 text-center">
              <div className="mx-auto grid size-12 place-items-center rounded-full bg-white/10">
                <ImageUp size={22} className="text-primary-200" />
              </div>
              <p className="mt-3 text-sm font-medium">{t('scan.noCameraTitle')}</p>
              <p className="mx-auto mt-1.5 max-w-xs text-xs leading-relaxed text-white/60">
                {t('scan.noCameraBody')}
              </p>
            </div>
          )}

          {(mode === 'captured' || mode === 'scanning') && shot && (
            <div className="relative bg-black">
              <img src={shot.previewUrl} alt={t('scan.preview')} className="block max-h-[52dvh] w-full object-contain" />
              {mode === 'scanning' && (
                <div className="absolute inset-0 grid place-items-center bg-black/65">
                  <div className="text-center">
                    <LoaderCircle size={26} className="mx-auto animate-spin text-primary-200" />
                    <p className="mt-2.5 text-xs font-medium">{t('scan.reading')}</p>
                  </div>
                </div>
              )}
            </div>
          )}

          {(error || failure) && (
            <div className="mx-4 mt-3 flex items-start gap-2.5 rounded-lg border border-signal-amber/40 bg-signal-amber/10 p-3">
              <CircleAlert size={15} className="mt-px shrink-0 text-signal-amber" />
              <div className="min-w-0 text-xs leading-relaxed">
                <p className="font-semibold">{failure ? failureTitle(failure, t) : t('scan.problem')}</p>
                <p className="mt-0.5 text-white/70">{failure?.note || error}</p>
                {typeof failure?.blur === 'number' && (
                  <p className="readout mt-1 text-[10px] text-white/40">sharpness {failure.blur}</p>
                )}
              </div>
            </div>
          )}

          {mode !== 'scanning' && (
            <p className="px-4 py-3 text-[11px] leading-relaxed text-white/50">{t('scan.hint')}</p>
          )}
        </div>

        <footer className="flex flex-wrap items-center gap-2 border-t border-steel-800 px-4 py-3">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="absolute size-px overflow-hidden opacity-0"
            tabIndex={-1}
            aria-hidden="true"
            onChange={(e) => {
              pickFile(e.target.files?.[0])
              e.target.value = ''
            }}
          />

          {mode === 'camera' && (
            <Btn className="h-11 flex-1" onClick={capture}>
              <Camera size={16} /> {t('scan.capture')}
            </Btn>
          )}

          {(mode === 'captured' || mode === 'scanning') && (
            <>
              <Btn variant="outline" className="h-11" onClick={retake} disabled={mode === 'scanning'}>
                <RotateCcw size={15} /> {t('scan.retake')}
              </Btn>
              <Btn className="h-11 flex-1" onClick={send} disabled={mode === 'scanning'}>
                {mode === 'scanning' ? (
                  <>
                    <LoaderCircle size={16} className="animate-spin" /> {t('scan.reading')}
                  </>
                ) : (
                  <>
                    <ScanLine size={16} /> {t('scan.use')}
                  </>
                )}
              </Btn>
            </>
          )}

          {mode !== 'scanning' && (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="min-h-11 cursor-pointer rounded-lg border border-steel-800 px-3 text-xs font-medium text-white/70 transition-colors hover:border-primary-200/50 hover:text-white"
            >
              {mode === 'nocamera' ? t('scan.choosePhotoPrimary') : t('scan.choosePhoto')}
            </button>
          )}
        </footer>
      </div>
    </div>
  )
}

function failureTitle(failure, t) {
  if (failure.reason === 'blurry') return t('scan.tooBlurry')
  if (failure.reason === 'provider') return t('scan.needsGemini')
  if (failure.reason === 'unavailable') return t('scan.offline')
  return t('scan.problem')
}

/**
 * Portrait A4 frame the technician lines the sheet up inside. Purely advisory — the
 * server still detects the page edges itself — but a squared-up photo makes that
 * detection succeed far more often than a sheet shot from the side of a bench.
 */
function AlignmentGuide({ label }) {
  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
      <div className="relative h-[82%] aspect-[1/1.414] max-w-[86%]">
        <div className="absolute inset-0 rounded-sm border-2 border-dashed border-primary-200/50" />
        {/* Solid corner brackets read as a targeting frame; the dashed edge alone is easy
            to lose against a busy background like a workbench. */}
        <span className="absolute -left-px -top-px size-7 rounded-tl-sm border-l-[3px] border-t-[3px] border-primary-200" />
        <span className="absolute -right-px -top-px size-7 rounded-tr-sm border-r-[3px] border-t-[3px] border-primary-200" />
        <span className="absolute -bottom-px -left-px size-7 rounded-bl-sm border-b-[3px] border-l-[3px] border-primary-200" />
        <span className="absolute -bottom-px -right-px size-7 rounded-br-sm border-b-[3px] border-r-[3px] border-primary-200" />
      </div>
      <p className="mt-3 rounded-full bg-black/65 px-3 py-1.5 text-center text-[11px] font-medium text-white">
        {label}
      </p>
    </div>
  )
}
