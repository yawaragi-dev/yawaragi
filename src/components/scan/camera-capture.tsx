'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  CameraSlash,
  Desktop,
  Images,
  Keyboard,
  Lightning,
  LightningSlash,
  UploadSimple,
} from '@phosphor-icons/react/dist/ssr'
import { useTranslations } from 'next-intl'
import {
  CAMERA_CONSTRAINTS,
  canUseLiveCamera,
  classifyCameraError,
  stopStream,
  supportsTorch,
} from '@/lib/scan/camera'
import { cn } from '@/lib/utils'

/**
 * §4 Camera — the Scan tab's own screen. Reference screenshots 06, 07, 08.
 *
 * It is a full-pane surface on a fixed `#121110` ground that sits *below* the
 * Ginshu ramp, with the tab bar shown and no ✕ — "the tabs are the way out"
 * (rule 11). The frame, the hint under it and the three bottom controls are
 * the whole screen; a result replaces it (ADR-0015 renders in place).
 *
 * **The live preview is an enhancement, never the capture path.** ADR-0012 is
 * explicit: "a build where the OS picker is unreachable violates this ADR."
 * So the gallery button is a complete fallback running the same pipeline, both
 * failure panels offer it, and `getUserMedia` is feature-detected before it is
 * called — a browser without `mediaDevices` renders screenshot 08 rather than
 * raising a permission dialog to discover it cannot stream.
 *
 * **The torch cannot ship on iOS** (`applyConstraints({ torch })` is absent
 * from WKWebView, the wrap's renderer). ADR-0012 says to hide the control and
 * keep its 44px grid slot so the title does not shift — not to render a
 * disabled button, which would invite a tap that does nothing. That is why the
 * top row is a three-column grid with a fixed 44px cell on each side rather
 * than a flex row, and why the "Type it" slot below works the same way.
 *
 * The stream starts on mount, because the visitor navigated to the Scan tab to
 * scan and §4 draws the frame live. It is stopped on unmount so the device
 * indicator light goes out when they leave.
 */

interface CameraCaptureProps {
  /**
   * A label is being read right now. The frame sweeps, the hint changes, and
   * the shutter goes inert — one capture at a time.
   */
  isWorking: boolean
  /** Hand a captured frame to the existing downscale + Server Action path. */
  onCapture: (file: File) => void
  /** Open the photo library. The fallback ADR-0012 requires stays reachable. */
  onChoosePhoto: () => void
  /**
   * Resolved path to §8 Search, or `null` while that screen is unported.
   *
   * `null` keeps the slot and renders nothing in it — the same discipline the
   * torch uses on iOS. A "Type it" control pointing at a route that does not
   * exist is the dead affordance #162 forbids; an empty reserved cell keeps
   * the shutter centred, which is the only thing the slot is load-bearing for.
   */
  typeItHref: string | null
}

type CameraState = 'starting' | 'live' | 'denied' | 'unavailable'

export function CameraCapture({
  isWorking,
  onCapture,
  onChoosePhoto,
  typeItHref,
}: CameraCaptureProps) {
  const t = useTranslations('scan.camera')
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [state, setState] = useState<CameraState>('starting')
  const [torchAvailable, setTorchAvailable] = useState(false)
  const [torchOn, setTorchOn] = useState(false)

  const start = useCallback(async () => {
    if (!canUseLiveCamera()) {
      setState('unavailable')
      return
    }
    setState('starting')
    try {
      const stream = await navigator.mediaDevices.getUserMedia(CAMERA_CONSTRAINTS)
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
      }
      setTorchAvailable(supportsTorch(stream.getVideoTracks()[0]))
      setState('live')
    } catch (error) {
      setState(classifyCameraError(error))
    }
  }, [])

  useEffect(() => {
    // `start` reads `navigator.mediaDevices`, which does not exist during SSR
    // — so the feature detect cannot move into a `useState` initialiser
    // without the server rendering "No camera here" and the client
    // contradicting it at hydration. Lint flags setState-in-effect as a
    // cascading-render smell, which is the right default; this is the
    // documented pattern for an SSR-safe browser-API read on mount, same as
    // `<ShibuyaRunner />`'s `matchMedia` read. One cascading render on mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void start()
    return () => {
      stopStream(streamRef.current)
      streamRef.current = null
    }
  }, [start])

  async function toggleTorch() {
    const track = streamRef.current?.getVideoTracks()[0]
    if (!track) return
    const next = !torchOn
    try {
      // `torch` is not in the standard `MediaTrackConstraintSet`, so the cast
      // is unavoidable — it is the capability `supportsTorch` just confirmed.
      await track.applyConstraints({
        advanced: [{ torch: next } as unknown as MediaTrackConstraintSet],
      })
      setTorchOn(next)
    } catch {
      // The device claimed the capability and then refused it. Drop the
      // control rather than leaving a toggle that lies about the light.
      setTorchAvailable(false)
      setTorchOn(false)
    }
  }

  function capture() {
    const video = videoRef.current
    if (!video || video.videoWidth === 0) return
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const context = canvas.getContext('2d')
    if (!context) return
    context.drawImage(video, 0, 0, canvas.width, canvas.height)
    canvas.toBlob(
      (blob) => {
        if (!blob) return
        // Handed on as a File, not a Blob, so it enters the SAME pipeline the
        // file input feeds — `downscaleImage` then `scanAction`. One capture
        // path downstream of two capture sources is what keeps the gallery a
        // true fallback rather than a parallel implementation.
        onCapture(new File([blob], 'label.jpg', { type: 'image/jpeg' }))
      },
      'image/jpeg',
      0.92,
    )
  }

  const isLive = state === 'live'
  const showFrame = state === 'starting' || isLive

  return (
    <section
      // The camera ground is fixed and sits below the Ginshu ramp — it is not
      // a ramp step, which is why it has its own token.
      className="flex flex-col bg-camera text-camera-ink"
      data-testid="scan-camera"
      data-camera-state={state}
    >
      {/* -- Top row: 44px · title · 44px ------------------------------- */}
      <div className="grid grid-cols-[44px_minmax(0,1fr)_44px] items-center px-3.5 py-3">
        <span aria-hidden="true" />
        {/*
          One line, always. §4: "nowrap, ellipsis as a last resort" — the
          title is the only thing telling the visitor which scan mode they are
          in, and a wrap would push the frame down by a line.
        */}
        <h1 className="truncate text-center text-card-heading font-medium whitespace-nowrap">
          {t('title')}
        </h1>
        {torchAvailable ? (
          <button
            type="button"
            onClick={() => void toggleTorch()}
            aria-pressed={torchOn}
            aria-label={t('torchLabel')}
            data-testid="scan-camera-torch"
            className="inline-flex size-11 items-center justify-center rounded-md text-camera-ink/80 transition-colors hover:text-camera-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ginshu-600"
          >
            {torchOn ? (
              <Lightning size={20} weight="fill" aria-hidden="true" />
            ) : (
              <LightningSlash size={20} aria-hidden="true" />
            )}
          </button>
        ) : (
          // The slot stays even when the control cannot — ADR-0012. Without
          // it the title re-centres and shifts sideways between devices.
          <span aria-hidden="true" data-testid="scan-camera-torch-slot" />
        )}
      </div>

      {showFrame ? (
        <div className="flex flex-col items-center gap-6 px-5 py-6">
          {/* -- Frame: 212×292, 30px brackets, reading sweep ----------- */}
          <div
            className={cn(
              'relative h-[292px] w-[212px] overflow-hidden rounded-[10px] transition-colors duration-300',
              // §4's frame fill, and what the torch brightens it to. The fill
              // is what makes the frame readable before the stream arrives.
              torchOn ? 'bg-[rgba(255,240,225,0.14)]' : 'bg-[rgba(255,255,255,0.04)]',
            )}
            data-testid="scan-camera-frame"
          >
            <video
              ref={videoRef}
              autoPlay
              muted
              playsInline
              // Decorative: the frame is a viewfinder, and everything a screen
              // reader needs is in the hint below it.
              aria-hidden="true"
              className={cn('h-full w-full object-cover', isLive ? 'opacity-100' : 'opacity-0')}
            />
            <CornerBrackets />
            {isWorking && (
              // The reading sweep. `animate-yw-sweep` is globally neutered
              // under `prefers-reduced-motion`, so this is decoration only —
              // the hint text below is what actually says "reading".
              <span
                aria-hidden="true"
                className="absolute inset-x-0 top-0 h-1/3 animate-yw-sweep bg-gradient-to-b from-transparent via-ginshu-500/35 to-transparent"
                data-testid="scan-camera-sweep"
              />
            )}
          </div>

          {/* -- Hint: 58px minimum, may grow to three lines for German -- */}
          <div
            className="flex min-h-[58px] flex-col items-center gap-1 text-center text-pretty"
            data-testid="scan-camera-hint"
            // Announced, because this is where "reading the label" is said.
            aria-live="polite"
          >
            <p className="text-md-alt font-medium">
              {isWorking ? t('workingTitle') : t('frameTitle')}
            </p>
            <p className="text-meta leading-relaxed text-camera-ink/70">
              {isWorking ? t('workingHint') : t('frameHint')}
            </p>
          </div>
        </div>
      ) : (
        <FallbackPanel
          kind={state === 'denied' ? 'denied' : 'unavailable'}
          onAllow={() => void start()}
          onChoosePhoto={onChoosePhoto}
          typeItHref={typeItHref}
        />
      )}

      {/* -- Bottom controls: 1fr · shutter · 1fr --------------------- */}
      {showFrame && (
        <div
          className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 px-5 pb-4 pt-2"
          data-testid="scan-camera-controls"
        >
          <div className="flex justify-start">
            {typeItHref !== null && (
              <a
                href={typeItHref}
                data-testid="scan-camera-type-it"
                className="inline-flex min-h-11 items-center gap-1.5 whitespace-nowrap rounded-md px-1 text-meta text-camera-ink/80 transition-colors hover:text-camera-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ginshu-600"
              >
                <Keyboard size={17} aria-hidden="true" />
                {t('typeIt')}
              </a>
            )}
          </div>
          {/*
            66px ring, 52px accent fill. Centred by the grid rather than by
            `justify-between`, so it stays on the screen's midline whatever
            the two side slots contain — which is the whole reason §4
            specifies a grid here.
          */}
          <button
            type="button"
            onClick={capture}
            disabled={!isLive || isWorking}
            aria-label={t('shutterLabel')}
            data-testid="scan-camera-shutter"
            className="inline-flex size-[66px] items-center justify-center rounded-full border-2 border-camera-ink/70 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ginshu-600 disabled:opacity-40"
          >
            <span aria-hidden="true" className="block size-[52px] rounded-full bg-ginshu-500" />
          </button>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={onChoosePhoto}
              aria-label={t('galleryLabel')}
              data-testid="scan-camera-gallery"
              className="inline-flex size-11 items-center justify-center rounded-md text-camera-ink/80 transition-colors hover:text-camera-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ginshu-600"
            >
              <Images size={20} aria-hidden="true" />
            </button>
          </div>
        </div>
      )}
    </section>
  )
}

/**
 * §4's four 30px corner brackets, 2px ginshu-600, matching the frame's 10px
 * radius. Four elements with two borders each rather than one bordered box:
 * the design's frame is corners only, so the eye reads the bottle through the
 * open edges instead of through a window.
 */
function CornerBrackets() {
  const common = 'pointer-events-none absolute size-[30px] border-ginshu-600'
  return (
    <span aria-hidden="true" data-testid="scan-camera-brackets">
      <span className={cn(common, 'left-0 top-0 rounded-tl-[10px] border-l-2 border-t-2')} />
      <span className={cn(common, 'right-0 top-0 rounded-tr-[10px] border-r-2 border-t-2')} />
      <span className={cn(common, 'bottom-0 left-0 rounded-bl-[10px] border-b-2 border-l-2')} />
      <span className={cn(common, 'bottom-0 right-0 rounded-br-[10px] border-b-2 border-r-2')} />
    </span>
  )
}

/**
 * Screenshots 07 and 08 — the two ways the frame does not fill.
 *
 * Left-aligned, not centred: these are panels of prose with a stack of
 * choices, and §4 draws them that way because a centred paragraph with three
 * buttons under it reads as an error dialog. The copy never does: "Camera is
 * off", not "Camera error".
 *
 * They share a component because they are the same panel with a different
 * first action — and keeping them together is what stops one of them from
 * quietly losing the gallery route that ADR-0012 requires.
 */
function FallbackPanel({
  kind,
  onAllow,
  onChoosePhoto,
  typeItHref,
}: {
  kind: 'denied' | 'unavailable'
  onAllow: () => void
  onChoosePhoto: () => void
  typeItHref: string | null
}) {
  const t = useTranslations('scan.camera')
  const Icon = kind === 'denied' ? CameraSlash : Desktop

  return (
    <div
      className="flex flex-col gap-3 px-5 py-8"
      data-testid={`scan-camera-${kind}`}
    >
      <Icon size={32} aria-hidden="true" className="text-camera-ink/70" />
      <h2 className="text-title font-medium">{t(`${kind}Title`)}</h2>
      <p className="text-body text-camera-ink/70">{t(`${kind}Body`)}</p>

      {kind === 'denied' ? (
        <>
          {/* 46px, secondary — the visitor can still say yes. */}
          <button
            type="button"
            onClick={onAllow}
            data-testid="scan-camera-allow"
            className="inline-flex min-h-[46px] items-center justify-center rounded-xl border border-camera-ink/25 px-4 text-card-heading font-medium transition-colors hover:border-camera-ink/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ginshu-600"
          >
            {t('allowCamera')}
          </button>
          {/* 46px, primary — §4 makes the photo the PRIMARY action here, not
              the permission. The visitor already has a way to finish. */}
          <button
            type="button"
            onClick={onChoosePhoto}
            data-testid="scan-camera-choose-photo"
            className="inline-flex min-h-[46px] items-center justify-center gap-2 rounded-xl border border-ginshu-400 px-4 text-card-heading font-medium text-ginshu-700 transition-colors hover:bg-ginshu-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ginshu-600"
          >
            <Images size={17} aria-hidden="true" />
            {t('choosePhoto')}
          </button>
        </>
      ) : (
        // Screenshot 08's 140px dashed drop zone. It is a button, not a bare
        // label: a drop target that only accepts a drag excludes anyone who
        // cannot drag, and the copy promises a click.
        <button
          type="button"
          onClick={onChoosePhoto}
          data-testid="scan-camera-drop-zone"
          className="flex h-[140px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-camera-ink/25 px-4 text-center transition-colors hover:border-camera-ink/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ginshu-600"
        >
          <UploadSimple size={20} aria-hidden="true" className="text-camera-ink/70" />
          <span className="text-body text-camera-ink/80">{t('dropZone')}</span>
        </button>
      )}

      {typeItHref !== null && (
        <a
          href={typeItHref}
          data-testid="scan-camera-fallback-type-it"
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md text-body text-camera-ink/80 transition-colors hover:text-camera-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ginshu-600"
        >
          <Keyboard size={17} aria-hidden="true" />
          {t('typeNameInstead')}
        </a>
      )}
    </div>
  )
}
