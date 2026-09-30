'use client'

// `'use client'` is load-bearing here: this component owns a file input
// with a change handler, runs the canvas downscale in the browser, holds
// the `URL.createObjectURL` for the visitor's photo preview, and calls
// `useActionState`. Every one of those is a concrete client-only need
// per CLAUDE.md.

import { startTransition, useActionState, useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { useTranslations } from 'next-intl'
import { Camera } from '@phosphor-icons/react/dist/ssr'
import NextLink from 'next/link'
import { useRouter } from 'next/navigation'
import { getPathname, Link } from '@/i18n/navigation'
import { Button } from '@/components/ui/button'
import { CameraCapture } from '@/components/scan/camera-capture'
import { ProvenanceBadgeView } from '@/components/sake/provenance-badge'
import { resolveBadgeKind } from '@/lib/provenance/policy'
// Per ADR-0014, attribution should render conditionally on the
// rendered-source-set. In scan-form we render brewery kanji from a
// Sakenowa-sourced brewery row in every status that mounts
// `SakenowaAttributionView` (matched / matched_brand_only /
// matched_brewery_only / ambiguous / consensus / confirm), so
// unconditional rendering matches the predicate today. When the
// scan flow can land on a fully-manual (brand AND brewery both
// `manual_curation`) record, thread sources through
// `ScanActionState` and gate these renders with
// `requiresSakenowaAttribution(sources)` from sakenowa-attribution.tsx.
import { SakenowaAttributionView } from '@/components/sake/sakenowa-attribution'
import { ScanResultCard } from '@/components/scan/scan-result-card'
import type { DebugEvent } from '@/lib/debug/debug-log'
import { appendDebugEvents } from '@/lib/debug/debug-store'
import {
  browserBitmapDecoder,
  browserCanvasFactory,
  downscaleImage,
} from '@/lib/scan/downscale'
import { scanAction } from '@/lib/scan/scan-action'
import {
  INITIAL_SCAN_ACTION_STATE,
  type ScanActionState,
} from '@/lib/scan/scan-action-state'
import { appendMatchToHistory } from '@/lib/scan/scan-history'
import { rememberScannedPhoto } from '@/lib/scan/scanned-photo'
import { useScanHistoryConsensus } from '@/lib/scan/use-scan-history-consensus'
import type { Locale } from '@/i18n/routing'

interface ScanFormProps {
  locale: Locale
  /**
   * Server-rendered debug-mode flag (sourced from the `yawaragi_debug`
   * cookie at request time, since the cookie is HttpOnly and not
   * readable from client JS). When true, the form pushes its
   * per-step events (file picked, downscale done, action returned)
   * into the app-level debug store; the layout's `<DebugPanelMount />`
   * picks them up and renders them. When false, every push is a
   * no-op.
   */
  debugMode?: boolean
}

/**
 * `<ScanForm />` — the client-side capture surface.
 *
 * Flow (post-ADR-0015 / #163, and §4 for step 1):
 *   1. Visitor sees `<CameraCapture />` — §4's viewfinder, with the shutter
 *      capturing from a live stream and a gallery button opening the photo
 *      library. It used to be two text buttons ("Take photo", gated on
 *      `(any-pointer: coarse)`, and "Upload photo"), each wired to its own
 *      hidden file input. The library input is still here and is still the
 *      path ADR-0012 guarantees; the `capture="environment"` one is gone,
 *      replaced by the live stream where it works and by screenshot 07's
 *      panel where it does not.
 *   2. On change, we hold onto the raw file (for a client-only
 *      `URL.createObjectURL` preview that never leaves the browser)
 *      AND downscale it via `<canvas>.toBlob` +
 *      `createImageBitmap({ imageOrientation: 'from-image' })`.
 *   3. We submit a `FormData` carrying the downscaled JPEG to the
 *      `scanAction` Server Action via `useActionState`.
 *   4. On a `matched` result we render `<ScanResultCard />` IN PLACE —
 *      photo + name + flavor chart + a "Full bottle page" row. The
 *      previous S1/S3 behaviour of `router.push`ing to `/sake/[brandId]`
 *      is gone (see ADR-0015).
 *
 * Every non-match state (`low_confidence`, `no_match`, `ambiguous`,
 * divergence variants) also stays on `/scan` and renders discovery-
 * framed copy — never "error" tone. The route as a whole is age-gated
 * upstream by the proxy so no flavor data reaches an unaccepted visitor.
 *
 * The camera is hidden once any result is on screen (`hasResult`): each
 * result state carries its own "Scan again", so leaving a viewfinder above
 * the answer just stacks a second way to do the same thing. The message-only
 * states keep it — see the comment on `hasResult` for which those are and
 * why. A "Scan again" dismisses the result and the viewfinder returns; see
 * `view` for why that is one value rather than five conditions.
 */
export function ScanForm({ locale, debugMode = false }: ScanFormProps) {
  const t = useTranslations('scan.form')
  const tCard = useTranslations('scan.resultCard')
  // ProvenanceBadgeView + SakenowaAttributionView are the sync presentational
  // halves; we resolve their strings via the client-side translator since this
  // module is `'use client'`. The badge's policy (don't render canonical
  // sources) is enforced by the action's tagged state — it only attaches when
  // the extraction came back with source: 'llm_extracted'.
  const tBadge = useTranslations('provenance.badge.llmExtracted')
  const tProvenanceSheet = useTranslations('provenance.sheet')
  const tAttribution = useTranslations('sakenowaAttribution')
  // Reused for the brewery label on the enriched no_match state (the
  // same label the sake detail page and result card render).
  const tSake = useTranslations('sake.brand')
  // §8's "Type it": the bridge the non-match states offer.
  const tSearch = useTranslations('search')
  const router = useRouter()
  // One file input: the photo library.
  //
  // There used to be two, so the visitor got a deterministic choice between
  // the camera and the library without depending on the OS sheet — the second
  // pinned `capture="environment"`. §4 replaces it with a live viewfinder,
  // which is the same choice made better: the shutter captures from the
  // stream, and where the stream cannot open, screenshot 07's panel routes to
  // this input. Keeping a hidden `capture` input beside the camera would be a
  // third capture path with no affordance pointing at it.
  const uploadInputRef = useRef<HTMLInputElement | null>(null)
  const [state, formAction, isActionPending] = useActionState<ScanActionState, FormData>(
    scanAction,
    INITIAL_SCAN_ACTION_STATE,
  )
  const [isDownscaling, setIsDownscaling] = useState(false)
  // Boolean rather than the raw error message — we surface a polite,
  // discovery-framed i18n string ('errorDownscale'), not the raw browser
  // exception, to keep DACH copy on-brand.
  const [downscaleFailed, setDownscaleFailed] = useState(false)
  /**
   * The visitor tapped "Scan again" and is back at the viewfinder.
   *
   * Local, because `useActionState` has no reset: the action's last result is
   * still in `state` and will be until a new submission replaces it. This is
   * what makes `hasResult` false again so §4's camera screen returns.
   */
  const [resultDismissed, setResultDismissed] = useState(false)
  // ADR-0015 / #163: the in-place result card shows the visitor's own
  // label photo. The URL is created from the ORIGINAL File the visitor
  // picked (pre-downscale — displays the friendliest quality). It never
  // leaves the browser: it's a `blob:` URL owned by this document and
  // is revoked as soon as we don't need it (new pick, form unmount).
  // Storing it in state (not a ref) so re-renders after `useActionState`
  // returns the matched result pick up the URL.
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)
  // Per-scan timing origin. Initialized to 0 so the ref initializer
  // stays pure for React 19's render-purity rules. `onFileChange`
  // writes the real epoch ms before the first event is pushed, so the
  // panel never sees a 0-based timestamp.
  const scanStartedAtRef = useRef<number>(0)
  // Tracks the last server `debugLog` we mirrored into the app-level
  // store so a re-render with the same state doesn't double-push the
  // same events.
  const lastServerLogRef = useRef<ReadonlyArray<DebugEvent> | null>(null)

  function pushClientEvent(message: string, data?: Record<string, unknown>): void {
    if (!debugMode) return
    appendDebugEvents([
      {
        tMs: Date.now() - scanStartedAtRef.current,
        source: 'ScanForm',
        level: 'info',
        message,
        data,
      },
    ])
  }

  // Reactive consensus over the per-tab scan history. When the
  // visitor's most recent scan lands in retry / low-confidence and a
  // strict majority of past successful scans in this tab agree on a
  // brand, we surface a "looks like X based on your recent scans"
  // card instead of the generic retry CTA — the visitor confirms
  // with one tap rather than rescanning again.
  const consensus = useScanHistoryConsensus()

  // ADR-0015 / #163: the auto-navigate `router.push('/sake/[brandId]')`
  // on a confident match has been removed. Every `matched` state now
  // renders `<ScanResultCard />` in place — the visitor's photo, the
  // brand kanji + romaji, the flavor chart, and an explicit "See full
  // details →" link back to `/sake/[brandId]` (still the deep-dive
  // permalink). The `matched_brand_only` / `matched_brewery_only`
  // divergence variants continue to render their divergence card in
  // place as they always have.
  //
  // Revoke the client-only object URL for the label photo when the
  // dependent value changes (React runs this cleanup with the previous
  // `photoUrl` closed over before running the next effect) OR when the
  // form unmounts. This is the single point of `revokeObjectURL` — a
  // second call from inside `onFileChange` would double-revoke.
  useEffect(() => {
    return () => {
      if (photoUrl) URL.revokeObjectURL(photoUrl)
    }
  }, [photoUrl])

  // Mirror every successful match into the per-tab history so the
  // consensus mechanism can vote across recent scans. Tracks
  // `matched` (auto + confirm tier) and `matched_brand_only` (the
  // brewery-divergence path from #127) — those are the two states
  // that carry a real brandId + sakeHref. Idempotent against the
  // same state being re-rendered: we don't track timestamps to
  // dedupe because every action invocation produces a fresh state
  // object with a fresh `tMs` upstream.
  useEffect(() => {
    if (
      state.status === 'matched' ||
      state.status === 'matched_brand_only' ||
      state.status === 'matched_brewery_only'
    ) {
      // For brewery-only matches the extracted name_ja is the
      // misread brand kanji — store the brand's CATALOGUE kanji
      // (already on `brandDivergence.stored`) so the history's
      // displayed kanji and the consensus card both show the
      // correct value, not the hallucination. Same for the romaji:
      // the brewery-only state's `brandDivergence.storedRomaji` is
      // the catalogue brand's romaji; the other two carry it on
      // `sakeRomaji` directly.
      // Prefer the catalogue brand kanji over the model's
      // extraction whenever it's available — the canonical form is
      // always more accurate, and in the field-swap rescue path the
      // extraction's name_ja is the model's single-char hallucination
      // (not the brand at all). `matched_brand_only` carries
      // `sakeKanji`; `matched_brewery_only` puts the canonical brand
      // kanji on `brandDivergence.stored`; `matched` (auto / confirm
      // tier) doesn't carry it today, so fall back to extraction
      // there.
      const nameKanji =
        state.status === 'matched_brewery_only'
          ? state.brandDivergence.stored
          : state.status === 'matched_brand_only'
          ? state.sakeKanji
          : state.extraction.name_ja
      const nameRomaji =
        state.status === 'matched_brewery_only'
          ? state.brandDivergence.storedRomaji
          : state.sakeRomaji
      appendMatchToHistory({
        brandId: state.brandId,
        sakeHref: state.sakeHref,
        nameKanji,
        nameRomaji,
        tMs: Date.now(),
      })
    }
  }, [state])

  // Mirror the server-side trace from the latest action result into
  // the app-level debug store. Guarded against re-renders that carry
  // the same `state.debugLog` reference: we only push when the array
  // identity changes (every action invocation produces a fresh array).
  useEffect(() => {
    if (!debugMode) return
    const serverLog = state.debugLog
    if (!serverLog || serverLog === lastServerLogRef.current) return
    lastServerLogRef.current = serverLog
    appendDebugEvents(serverLog)
  }, [debugMode, state.debugLog])

  function onUploadClick() {
    setDownscaleFailed(false)
    uploadInputRef.current?.click()
  }

  /**
   * Every in-result "Scan again" — §4's model is camera-first.
   *
   * It used to open the photo library, because there was no camera screen to
   * return to: the entry affordance was two buttons, and reopening the picker
   * was the shortest path. §4 makes the camera the Scan tab's screen, so a
   * rescan dismisses the result and the viewfinder is simply there again. One
   * tap to the camera, then the shutter — rather than one tap into an OS file
   * browser the visitor did not ask for.
   *
   * `useActionState` has no reset, so dismissal is local state that
   * `hasResult` reads. `handleFile` clears it, so the next result shows.
   */
  function onPickClick() {
    setResultDismissed(true)
    setPhotoUrl(null)
    setDownscaleFailed(false)
  }

  async function onFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    await handleFile(file)
  }

  /**
   * One pipeline, two sources. The live camera hands a captured frame in here
   * as a `File`, exactly as the OS picker does through `onFileChange` — which
   * is what keeps the gallery a true fallback rather than a parallel
   * implementation (ADR-0012: "a build where the OS picker is unreachable
   * violates this ADR").
   */
  async function handleFile(file: File) {
    setDownscaleFailed(false)
    // A new attempt supersedes whatever the visitor dismissed to get here.
    setResultDismissed(false)
    setIsDownscaling(true)
    // New scan attempt — reset the relative-time origin so subsequent
    // events show time since pick. Events accumulate in the app-level
    // store (intentionally NOT cleared here) so the operator can scroll
    // back across multiple attempts.
    scanStartedAtRef.current = Date.now()
    pushClientEvent(`picked file "${file.name}" (${file.size} bytes, ${file.type || 'no MIME'})`)
    // Set up the client-only photo preview URL BEFORE the async
    // downscale kicks off. The effect below revokes the previous URL
    // when this state change lands.
    setPhotoUrl(URL.createObjectURL(file))
    // And hold it for the bottle page, which shows it in §9's bottle slot
    // when the visitor taps through from the result. Memory only — see
    // `scanned-photo.ts`.
    rememberScannedPhoto(file)
    try {
      const downscaleStart = Date.now()
      const downscaled = await downscaleImage(file, {
        decode: browserBitmapDecoder,
        createContext: browserCanvasFactory,
      })
      pushClientEvent(
        `downscaled to ${downscaled.size} bytes in ${Date.now() - downscaleStart}ms`,
        { ratio: Number((downscaled.size / file.size).toFixed(2)) },
      )
      const formData = new FormData()
      formData.set('image', downscaled, 'label.jpg')
      formData.set('locale', locale)
      pushClientEvent('submitting FormData to scanAction')
      // useActionState's action must be invoked from a transition. We
      // can't keep the await above inside startTransition (transitions
      // can't span an async boundary), so we open one here once the
      // blob is ready and let React schedule the action.
      startTransition(() => formAction(formData))
    } catch {
      // The downscale uses standard browser APIs (createImageBitmap,
      // canvas.toBlob) so a failure here usually means the file isn't
      // a decodable image — surface the localized hint, not the raw
      // exception (no promotional copy per JMStV).
      setDownscaleFailed(true)
      pushClientEvent('downscale failed; surfaced localized error', undefined)
    } finally {
      setIsDownscaling(false)
      // Reset the input so picking the same file again still fires onChange
      // (browsers suppress duplicate-value events). A camera capture never
      // goes through the input, so there is nothing to clear for that path.
      if (uploadInputRef.current) uploadInputRef.current.value = ''
    }
  }

  const isPending = isDownscaling || isActionPending

  // The two pickers are the ENTRY affordance: they are how a visitor with
  // nothing on screen starts a scan. Once a result is on screen, the
  // result owns the rescan — every non-match state renders its own "scan
  // again" button next to its copy, and the match states get the shared
  // row below. Keeping the entry pair at the top as well left two ways to
  // do the same thing stacked above the answer the visitor asked for,
  // which is what the maintainer caught on the low-confidence screen.
  //
  // The message-only states are deliberately NOT in here
  // (`invalid_input`, `session_missing`, `rate_limited`,
  // `extraction_failed`, and the client-side `downscaleFailed`): they
  // render a line of copy and nothing else, so the entry pair is their
  // only way forward and must stay.
  /**
   * What the screen shows, as opposed to what the action last returned.
   *
   * They diverge for exactly one reason: the visitor tapped "Scan again" and
   * is back at the viewfinder. `useActionState` has no reset, so `state` still
   * holds the dismissed result — and an earlier draft gated only the camera on
   * that flag, which put the viewfinder back UNDERNEATH the card it was meant
   * to replace. Deriving the whole view from one value makes that class of
   * half-dismissal impossible rather than fixing it five times.
   *
   * Message-only states are unaffected: nothing in them calls the dismisser,
   * so a rate-limit line cannot be tapped away while the limit still applies.
   */
  //
  // A read in flight shows the camera too. §4 is "capture → about 2s working
  // → result": the frame holds the captured still, sweeps, and says "Reading
  // the label…". Before this, a rescan from a result put the OLD result back,
  // faded, for the whole read — `handleFile` clears the dismissal at the start
  // of the read — so the working state only ever appeared on a first scan.
  const view = resultDismissed || isPending ? INITIAL_SCAN_ACTION_STATE : state


  const isMatch =
    view.status === 'matched' ||
    view.status === 'matched_brand_only' ||
    view.status === 'matched_brewery_only'
  const hasResult =
    isMatch ||
    view.status === 'low_confidence' ||
    view.status === 'no_match' ||
    view.status === 'ambiguous'

  /**
   * The one-line message states — none of them is a result, so the camera
   * stays up and shows the line itself, under its title.
   *
   * They used to render under the camera, and since §4 made the camera
   * exactly one screen tall that was below the fold: a visitor who hit the
   * rate limit saw the shutter come back and nothing else (maintainer report).
   *
   * - `rate_limited`: PRD #105 / #107 discovery copy with the retry time,
   *   rounded UP to whole hours so the visitor never hits the wall again
   *   before the window we told them about has closed.
   * - `extraction_failed`: the action catches the vision call + lookup;
   *   random non-sake photos routinely end here. The copy stays generic; the
   *   debug overlay carries the technical error.
   * - `session_missing`: defensive (the proxy is the cookie's sole writer
   *   since #161), kept so a matcher gap reads as a polite line, not a throw.
   * - `invalid_input`, and the client-side `downscaleFailed`.
   */
  const notice: { testId: string; text: string } | null = downscaleFailed
    ? { testId: 'scan-error-downscale', text: t('errorDownscale') }
    : view.status === 'rate_limited'
      ? {
          testId: 'scan-error-rate-limited',
          text: t('rateLimited', { hours: Math.max(1, Math.ceil(view.retryAfterSec / 3600)) }),
        }
      : view.status === 'extraction_failed'
        ? { testId: 'scan-error-extraction-failed', text: t('extractionFailed') }
        : view.status === 'invalid_input'
          ? { testId: 'scan-error-invalid-input', text: t('errorInvalidInput') }
          : view.status === 'session_missing'
            ? { testId: 'scan-error-session-missing', text: t('sessionMissing') }
            : null

  // The form is JS-only: there is no no-JS submit path because the canvas
  // downscale runs in the browser before we ever build the FormData. The
  // `onSubmit` handler exists so the Enter key on the button doesn't fall
  // through to a server post that would receive an empty body.
  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
  }

  return (
    <form onSubmit={onSubmit} data-testid="scan-form" className="flex w-full flex-col">
      <input
        ref={uploadInputRef}
        type="file"
        name="image-picker"
        accept="image/*"
        onChange={onFileChange}
        className="sr-only"
        data-testid="scan-file-input"
        aria-label={t('uploadAriaLabel')}
      />
      {!hasResult && (
        /*
          §4 Camera. This used to be two text buttons — "Take photo", gated on
          `(any-pointer: coarse)`, and "Upload photo" — which is what the Scan
          tab's main screen was: a heading, a paragraph and two buttons. The
          design gives the tab a viewfinder.
          
          Both of those buttons survive inside it: the shutter captures from
          the live stream, and the gallery button opens the same photo-library
          input the "Upload photo" button did. The native `capture="environment"`
          input is no longer surfaced — the live camera replaces it where it
          works, and where it does not, screenshot 07's panel offers the photo
          library instead, which is the path ADR-0012 guarantees.
        */
        <CameraCapture
          isWorking={isPending}
          onCapture={(file) => void handleFile(file)}
          onChoosePhoto={onUploadClick}
          typeItHref="/search"
          stillUrl={photoUrl}
          notice={notice}
        />
      )}

      {/*
        Everything that is not the camera sits on the page gutter. The camera
        runs edge to edge (§4's ground); the results and messages used to share
        its zero-padding parent and ran flush against the screen edge.
        `empty:hidden` drops the gutter's padding when there is nothing in it.
      */}
      <div className="flex flex-col items-stretch gap-4 px-5 py-5 empty:hidden">

        {view.status === 'low_confidence' && consensus && (
          // Retry / low_confidence tier AND the per-tab history has a
          // strict-majority consensus on a brand from earlier successful
          // scans. Surface the consensus as a soft-match: "based on
          // your recent scans, this looks like X". Explicit tap to
          // accept — consensus over noisy retry-mode inputs is still
          // inference, not certainty. The vote count (3 of 5) is shown
          // so the visitor understands what the system is leaning on.
          <div
            className="flex flex-col gap-3"
            data-testid="scan-result-consensus"
          >
            <SakenowaAttributionView
              placement="inline"
              poweredBy={tAttribution('poweredBy')}
              linkLabel={tAttribution('linkLabel')}
            />
            <p className="text-sm text-zinc-700 dark:text-zinc-300">
              {t('consensusTitle')}
            </p>
            <div className="flex flex-col gap-1">
              <span className="flex items-baseline gap-2">
                <span
                  className="text-base font-medium"
                  lang="ja"
                  data-testid="scan-result-consensus-kanji"
                >
                  {consensus.nameKanji}
                </span>
                {consensus.nameRomaji && (
                  <span
                    className="text-sm text-zinc-600 dark:text-zinc-400"
                    data-testid="scan-result-consensus-romaji"
                  >
                    ({consensus.nameRomaji})
                  </span>
                )}
              </span>
              <span
                className="text-xs text-zinc-500 dark:text-zinc-500"
                data-testid="scan-result-consensus-votes"
              >
                {t('consensusVotes', { votes: consensus.votes, total: consensus.total })}
              </span>
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                onClick={() => {
                  router.push(consensus.sakeHref)
                }}
                data-testid="scan-result-consensus-accept"
              >
                {t('consensusAccept')}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={onPickClick}
                data-testid="scan-result-consensus-rescan"
              >
                {t('consensusRescan')}
              </Button>
              {/*
                This card is a guess from the visitor's own history after a
                label we could NOT read. If the guess is wrong, rescanning
                re-runs the same bad photo in the same bad light — typing the
                name is the way out, and it is the reason §8 exists. Every
                other non-match state offers it; leaving this one without it
                made the accept button the only forward path.
              */}
              <Link
                href="/search"
                className="inline-flex items-center text-sm font-medium underline underline-offset-4"
                data-testid="scan-result-consensus-type-it"
              >
                {tSearch('cta')}
              </Link>
            </div>
          </div>
        )}
        {view.status === 'low_confidence' && !consensus && (
          // Retry tier (confidence < 0.60). No lookup attempted upstream
          // — the model isn't confident enough about the (name, brewery)
          // pair to be worth checking against Sakenowa. Per #163 this
          // is framed as discovery, not error: neutral zinc colours (no
          // amber alert), no `role="alert"`. The back-label hint stays
          // (real-world bottles like 二世古 ship designer-driven front
          // labels the model can't parse but legible regulatory back
          // labels), plus an explicit rescan button and a bridge to the
          // sibling suggest surface so a curious tester who scanned a
          // coffee mug still has a way to keep exploring.
          <div
            className="flex flex-col gap-2"
            data-testid="scan-result-retry"
          >
            <p
              className="text-sm text-zinc-700 dark:text-zinc-300"
              data-testid="scan-result-low-confidence"
            >
              {t('lowConfidence')}
            </p>
            <p
              className="text-xs text-zinc-500 dark:text-zinc-500"
              data-testid="scan-result-back-label-hint"
            >
              {t('backLabelHint')}
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={onPickClick}
                data-testid="scan-result-retry-rescan"
              >
                {t('retryRescan')}
              </Button>
              <Link
                href="/search"
                className="text-sm font-medium underline underline-offset-4"
                data-testid="scan-result-retry-type-it"
              >
                {tSearch('cta')}
              </Link>
              <Link
                href="/suggest"
                className="text-sm font-medium underline underline-offset-4"
                data-testid="scan-result-explore-sample"
              >
                {tCard('exploreAnotherWay')}
              </Link>
            </div>
          </div>
        )}
        {view.status === 'no_match' && (
          // Bottle wasn't found in the catalogue. Sometimes this is
          // genuine (limited edition, collaboration product — covered
          // by §22/§23) and sometimes the model fabricated a
          // confidently-shaped name unrelated to the bottle (§23).
          // The back-label hint covers the latter case. Per #163 the
          // copy is discovery-framed, not error-framed, and we surface
          // both a "scan again" affordance and a bridge to /suggest —
          // a visitor who tried scanning a coffee mug still has an
          // inviting next step, not a dead end.
          <div
            className="flex flex-col gap-3"
            data-testid="scan-result-no-match"
          >
            {/*
              No-match enrichment (#109 PR B). Show the visitor WHAT we
              read from the label so they can judge whether the model
              misread it or the bottle is genuinely absent. The extracted
              name + brewery are LLM-derived, so the name renders next to
              a <ProvenanceBadge kind="llmExtracted" /> on the same
              baseline (CLAUDE.md provenance rule). Kanji renders verbatim
              (lang="ja"), never translated.
            */}
            <p
              className="text-sm text-zinc-700 dark:text-zinc-300"
              data-testid="scan-result-no-match-read-label"
            >
              {t('noMatchReadLabel')}
            </p>
            <div className="flex flex-col gap-1">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className="text-base font-medium"
                  lang="ja"
                  data-testid="scan-result-no-match-name-ja"
                >
                  {view.extraction.name_ja}
                </span>
                <ProvenanceBadgeView
                  kind={resolveBadgeKind('llm_extracted')}
                  label={tBadge('label')}
                  explanation={tBadge('explanation')}
                  sheetTitle={tBadge('sheetTitle')}
                  closeLabel={tProvenanceSheet('closeLabel')}
                  confidence={view.extraction.confidence}
                  id="scan-result-no-match-badge"
                />
              </div>
              <div
                className="flex flex-wrap items-baseline gap-1.5 text-sm text-zinc-600 dark:text-zinc-400"
                data-testid="scan-result-no-match-brewery-ja"
              >
                <span className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-500">
                  {tSake('breweryLabel')}
                </span>
                <span lang="ja">{view.extraction.brewery_ja}</span>
              </div>
            </div>
            <p className="text-sm text-zinc-700 dark:text-zinc-300">{t('noMatch')}</p>
            <p
              className="text-xs text-zinc-500 dark:text-zinc-500"
              data-testid="scan-result-no-match-back-label-hint"
            >
              {t('backLabelHint')}
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={onPickClick}
                data-testid="scan-result-no-match-rescan"
              >
                {t('retryRescan')}
              </Button>
              <Link
                href="/search"
                className="text-sm font-medium underline underline-offset-4"
                data-testid="scan-result-no-match-type-it"
              >
                {tSearch('cta')}
              </Link>
              <Link
                href="/suggest"
                className="text-sm font-medium underline underline-offset-4"
                data-testid="scan-result-no-match-explore"
              >
                {tCard('exploreAnotherWay')}
              </Link>
            </div>
          </div>
        )}
        {view.status === 'ambiguous' && (() => {
          // Disambiguation list. Each candidate carries its brand
          // kanji + romaji and its brewery info; if every candidate
          // shares the same brewery (common shape from brewery-only
          // ambiguous), the UI surfaces that brewery in the header so
          // the visitor knows *which* brewery they matched.
          //
          // Defensive copy: the discriminated union types candidates
          // as a non-optional array, but the 2026-06-13 dev log
          // captured a render-time crash here with `candidates is
          // undefined`. Hypothesis: a stale serialized state from
          // before #109's wire-shape change (which renamed
          // `brandIds` → `candidates`) survived a hot reload and the
          // client saw `{status: 'ambiguous'}` with no candidates
          // field. Treat missing/non-array as empty and fall through
          // to the no-match copy rather than crashing the whole
          // page into Next.js's "This page couldn't load" overlay.
          const candidates = Array.isArray(view.candidates) ? view.candidates : []
          const breweryKanjis = new Set(candidates.map((c) => c.breweryKanji))
          const sharedBrewery = breweryKanjis.size === 1 ? candidates[0] : null
          // Compose the "romaji, prefecture" parenthetical shown next to
          // a brewery's kanji. Both are optional (romaji may be null for
          // an un-transliterated row; prefecture null for an unknown
          // areaId), so we drop empties and only render parens when at
          // least one part survives. The kanji itself is always shown by
          // the caller. Prefecture is the discriminator for same-brand-
          // across-breweries collisions (Hakushika: Ibaraki vs Hyogo).
          const breweryParens = (
            romaji: string | null,
            prefecture: string | null,
          ): string | null => {
            const parts = [romaji, prefecture].filter(
              (p): p is string => Boolean(p),
            )
            return parts.length > 0 ? parts.join(', ') : null
          }
          const sharedBreweryParens = sharedBrewery
            ? breweryParens(sharedBrewery.breweryRomaji, sharedBrewery.prefectureName)
            : null
          const sharedBreweryDescriptor = sharedBrewery
            ? sharedBreweryParens
              ? `${sharedBrewery.breweryKanji} (${sharedBreweryParens})`
              : sharedBrewery.breweryKanji
            : ''
          return (
            <div
              className="flex flex-col gap-3"
              data-testid="scan-result-ambiguous"
            >
              <SakenowaAttributionView
                placement="inline"
                poweredBy={tAttribution('poweredBy')}
                linkLabel={tAttribution('linkLabel')}
              />
              <p className="text-sm text-zinc-700 dark:text-zinc-300">
                {sharedBrewery
                  ? t('ambiguousSharedBrewery', { brewery: sharedBreweryDescriptor })
                  : t('ambiguous')}
              </p>
              <ul className="flex flex-col gap-1.5" data-testid="scan-result-ambiguous-list">
                {candidates.map((c) => (
                  <li key={c.brandId}>
                    <NextLink
                      href={c.sakeHref}
                      className="flex flex-col gap-0.5 rounded border border-zinc-200 px-3 py-2 transition-colors hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 dark:border-zinc-800 dark:hover:bg-zinc-900"
                      data-testid={`scan-result-ambiguous-candidate-${c.brandId}`}
                    >
                      <span className="flex items-baseline gap-2 flex-wrap">
                        <span className="text-base font-medium" lang="ja">
                          {c.nameKanji}
                        </span>
                        {c.nameRomaji && (
                          <span className="text-sm text-zinc-600 dark:text-zinc-400">
                            ({c.nameRomaji})
                          </span>
                        )}
                      </span>
                      {!sharedBrewery && (() => {
                        // Cross-brewery candidates: show the brewery kanji
                        // plus a "(romaji, prefecture)" parenthetical so a
                        // same-brand-across-breweries collision is
                        // resolvable by region (the Hakushika shape).
                        const parens = breweryParens(c.breweryRomaji, c.prefectureName)
                        return (
                          <span className="text-xs text-zinc-500 dark:text-zinc-500 flex items-baseline gap-1 flex-wrap">
                            <span lang="ja">{c.breweryKanji}</span>
                            {parens && <span>({parens})</span>}
                          </span>
                        )
                      })()}
                    </NextLink>
                  </li>
                ))}
              </ul>
              <p
                className="text-xs text-zinc-500 dark:text-zinc-500"
                data-testid="scan-result-ambiguous-not-listed"
              >
                {t('ambiguousNotListed')}
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={onPickClick}
                  data-testid="scan-result-ambiguous-rescan"
                >
                  {t('ambiguousRescan')}
                </Button>
                <Link
                  href="/search"
                  className="text-sm font-medium underline underline-offset-4"
                  data-testid="scan-result-ambiguous-type-it"
                >
                  {tSearch('cta')}
                </Link>
                <Link
                  href="/suggest"
                  className="text-sm font-medium underline underline-offset-4"
                  data-testid="scan-result-ambiguous-explore"
                >
                  {tCard('exploreAnotherWay')}
                </Link>
              </div>
            </div>
          )
        })()}
        {view.status === 'matched' && (
          // ADR-0015 / #163: the matched result renders IN PLACE on /scan
          // (previously auto-navigated to /sake/[brandId] on the auto tier
          // and rendered a text-only confirm card on the confirm tier).
          // Both confidence tiers now share the same rich `<ScanResultCard />`
          // — photo + kanji + romaji + provenance badge + flavor chart +
          // an explicit "Full bottle page" row. The tier information
          // survives inside `view.extraction.confidence`, which the
          // provenance badge renders as its confidence sub-label — that's
          // where a curious visitor can see how sure the system is about
          // its read.
          <ScanResultCard
            photoUrl={photoUrl}
            photoAlt={t('photoAlt')}
            sakeKanji={view.extraction.name_ja}
            sakeRomaji={view.sakeRomaji}
            breweryKanji={view.extraction.brewery_ja}
            breweryRomaji={view.breweryRomaji}
            sakeHref={view.sakeHref}
            // Resolved through the typed pathnames manifest rather than
            // appending "/similar" to `sakeHref`: the two routes happen to
            // share a spelling in both locales today, and a string append
            // would break silently the day one of them is localised.
            similarHref={getPathname({
              locale,
              href: {
                pathname: '/sake/[brandId]/similar',
                params: { brandId: String(view.brandId) },
              },
            })}
            flavorChart={view.flavorChart}
            extractionConfidence={view.extraction.confidence}
            // Rescan-in-flight fade: `isPending` covers both the browser-
            // side downscale AND the server round-trip. While either is
            // running, the visitor's fresh photo is already displayed
            // (set in `onFileChange`) but every other field is stale —
            // fading them tells the visitor "the previous match is
            // being replaced" without hiding their new bottle.
            isStale={isPending}
          />
        )}
        {view.status === 'matched_brand_only' && (
          // Phase 3 / #123: brand-only fallback succeeded but the
          // brewery on the label diverged from the catalogue. NO
          // auto-navigate — the visitor must make a conscious tap so
          // the divergence is acknowledged. Side-by-side display of the
          // two brewery values (label vs catalogue) so the visitor can
          // judge whether the brand match is the one they meant.
          <div
            className="flex flex-col gap-3"
            data-testid="scan-result-matched-brand-only"
          >
            <SakenowaAttributionView
              placement="inline"
              poweredBy={tAttribution('poweredBy')}
              linkLabel={tAttribution('linkLabel')}
            />
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className="text-base font-medium"
                lang="ja"
                data-testid="scan-result-name-ja"
              >
                {view.sakeKanji}
              </span>
              {view.sakeRomaji && (
                <span
                  className="text-sm text-zinc-600 dark:text-zinc-400"
                  data-testid="scan-result-matched-brand-only-sake-romaji"
                >
                  ({view.sakeRomaji})
                </span>
              )}
              <ProvenanceBadgeView
                kind={resolveBadgeKind('llm_extracted')}
                label={tBadge('label')}
                explanation={tBadge('explanation')}
                sheetTitle={tBadge('sheetTitle')}
                closeLabel={tProvenanceSheet('closeLabel')}
                confidence={view.extraction.confidence}
                id="scan-result-matched-brand-only-badge"
              />
            </div>
            <p className="text-sm text-zinc-700 dark:text-zinc-300">
              {t('matchedBrandOnly')}
            </p>
            <p
              className="text-sm text-zinc-600 dark:text-zinc-400"
              data-testid="scan-result-brewery-divergence"
            >
              <span lang="ja">
                {t('matchedBrandOnlyDivergence', {
                  extracted: view.breweryDivergence.extracted,
                  stored: view.breweryDivergence.stored,
                })}
              </span>
              {view.breweryDivergence.storedRomaji && (
                <>
                  {' '}
                  <span data-testid="scan-result-brewery-divergence-romaji">
                    ({view.breweryDivergence.storedRomaji})
                  </span>
                </>
              )}
            </p>
            <NextLink
              href={view.sakeHref}
              className="text-sm font-medium text-blue-700 underline-offset-2 hover:underline dark:text-blue-300"
              data-testid="scan-result-matched-brand-only-link"
            >
              {t('matchedBrandOnlyOpen')}
            </NextLink>
          </div>
        )}
        {view.status === 'matched_brewery_only' && (
          // Structural dual of `matched_brand_only` (#123). The
          // brand-only fallback also missed, but brewery-only found a
          // mono-brand brewery: the brewery is identified, the brand
          // the model extracted does NOT match what Sakenowa stores
          // for that brewery. NO auto-navigate — explicit-tap required
          // so the divergence is acknowledged. The CATALOGUE brand
          // kanji is shown prominently (it's the trusted value) with
          // the extracted brand surfaced via the divergence line below
          // alongside the LLM-extracted provenance badge.
          <div
            className="flex flex-col gap-3"
            data-testid="scan-result-matched-brewery-only"
          >
            <SakenowaAttributionView
              placement="inline"
              poweredBy={tAttribution('poweredBy')}
              linkLabel={tAttribution('linkLabel')}
            />
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className="text-base font-medium"
                lang="ja"
                data-testid="scan-result-name-ja"
              >
                {view.brandDivergence.stored}
              </span>
              {view.brandDivergence.storedRomaji && (
                <span
                  className="text-sm text-zinc-600 dark:text-zinc-400"
                  data-testid="scan-result-matched-brewery-only-sake-romaji"
                >
                  ({view.brandDivergence.storedRomaji})
                </span>
              )}
              <ProvenanceBadgeView
                kind={resolveBadgeKind('llm_extracted')}
                label={tBadge('label')}
                explanation={tBadge('explanation')}
                sheetTitle={tBadge('sheetTitle')}
                closeLabel={tProvenanceSheet('closeLabel')}
                confidence={view.extraction.confidence}
                id="scan-result-matched-brewery-only-badge"
              />
            </div>
            {view.breweryRomaji && (
              <span
                className="text-sm text-zinc-600 dark:text-zinc-400 flex items-baseline gap-2 flex-wrap"
                data-testid="scan-result-matched-brewery-only-brewery"
              >
                <span lang="ja">{view.extraction.brewery_ja}</span>
                <span>({view.breweryRomaji})</span>
              </span>
            )}
            <p className="text-sm text-zinc-700 dark:text-zinc-300">
              {t('matchedBreweryOnly')}
            </p>
            <p
              className="text-sm text-zinc-600 dark:text-zinc-400"
              data-testid="scan-result-brand-divergence"
            >
              <span lang="ja">
                {t('matchedBreweryOnlyDivergence', {
                  extracted: view.brandDivergence.extracted,
                  stored: view.brandDivergence.stored,
                })}
              </span>
              {view.brandDivergence.storedRomaji && (
                <>
                  {' '}
                  <span data-testid="scan-result-brand-divergence-romaji">
                    ({view.brandDivergence.storedRomaji})
                  </span>
                </>
              )}
            </p>
            <NextLink
              href={view.sakeHref}
              className="text-sm font-medium text-blue-700 underline-offset-2 hover:underline dark:text-blue-300"
              data-testid="scan-result-matched-brewery-only-link"
            >
              {t('matchedBreweryOnlyOpen')}
            </NextLink>
          </div>
        )}
        {isMatch && (
          // The three match states are the only results that carried no
          // rescan of their own — they leaned on the entry pair above,
          // which is now hidden while a result is on screen. One shared
          // row serves all three: the same "Scan again" wording the
          // non-match states use, so the escape hatch reads identically
          // wherever the visitor lands. §5 puts this in a top bar as a
          // ghost "Not this one"; that bar arrives with the §4 camera
          // port, and until then the affordance lives under the card
          // rather than not existing.
          //
          // It returns to the camera, which is what this comment used to say
          // belonged with §4 — this is §4. It opened the photo library before,
          // because the camera was a hidden input and there was no screen to go
          // back to.
          //
          // Full width, with room above it (maintainer review): a small
          // outline button left-aligned under a full-width card read as an
          // afterthought, and it is the screen's one next action. Interim
          // until the designers place it — §5 draws it as "Not this one" in a
          // top bar we have not built (asked on #308).
          <div className="mt-3" data-testid="scan-result-match-rescan-row">
            <button
              type="button"
              onClick={onPickClick}
              disabled={isPending}
              data-testid="scan-result-match-rescan"
              className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-divider text-card-heading font-medium text-ink transition-colors hover:bg-ash-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ginshu-600 disabled:opacity-60"
            >
              <Camera size={18} aria-hidden="true" className="text-ash-600" />
              {isPending ? t('pending') : t('retryRescan')}
            </button>
          </div>
        )}
      </div>
    </form>
  )
}
