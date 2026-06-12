'use client'

// `'use client'` is load-bearing here: this component owns a file input
// with a change handler, runs the canvas downscale in the browser, calls
// `useActionState`, and conditionally `router.push`es on the matched
// state. Every one of those is a concrete client-only need per CLAUDE.md.

import { startTransition, useActionState, useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { ProvenanceBadgeView } from '@/components/sake/provenance-badge'
import { SakenowaAttributionView } from '@/components/sake/sakenowa-attribution'
import type { DebugEvent } from '@/lib/debug/debug-log'
import { appendDebugEvents } from '@/lib/debug/debug-store'
import {
  browserBitmapDecoder,
  browserCanvasFactory,
  downscaleImage,
} from '@/lib/scan/downscale'
import { resolveConfidenceTier } from '@/lib/scan/confidence-tier'
import { scanAction } from '@/lib/scan/scan-action'
import {
  INITIAL_SCAN_ACTION_STATE,
  type ScanActionState,
} from '@/lib/scan/scan-action-state'
import { appendMatchToHistory } from '@/lib/scan/scan-history'
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
 * `<ScanForm />` — the client-side capture surface for Phase 3 / S1.
 *
 * Flow (PRD #105 §"Wire shape"):
 *   1. Visitor sees two buttons: "Take photo" (mobile / touchscreen
 *      only — `(any-pointer: coarse)`) and "Upload photo" (always
 *      visible). Each is wired to its own hidden `<input type="file">`:
 *      the camera input pins `capture="environment"` and always opens
 *      the back camera; the upload input has no `capture` and always
 *      opens the photo-library / file picker. The two-input pattern
 *      gives the visitor a deterministic choice rather than relying on
 *      the OS to show its (browser- and version-dependent)
 *      "Photo Library / Take Photo / Choose File" sheet — many
 *      Android Chrome builds and older iOS versions skip the sheet
 *      and jump straight to one path, hiding the other.
 *   2. On change, we downscale the captured file in the browser via
 *      `<canvas>.toBlob` and `createImageBitmap({ imageOrientation:
 *      'from-image' })`.
 *   3. We submit a `FormData` carrying the downscaled JPEG to the
 *      `scanAction` Server Action via `useActionState`.
 *   4. On a `matched` result we `router.push` to the matched sake page —
 *      `<ProvenanceBadge />` + `<SakenowaAttribution />` already live
 *      there.
 *
 * Out of scope for S1: medium/low confidence UX, disambiguation list,
 * no-match copy with a "submit to Sakenowa" affordance.
 */
export function ScanForm({ locale, debugMode = false }: ScanFormProps) {
  const t = useTranslations('scan.form')
  // ProvenanceBadgeView + SakenowaAttributionView are the sync presentational
  // halves; we resolve their strings via the client-side translator since this
  // module is `'use client'`. The badge's policy (don't render canonical
  // sources) is enforced by the action's tagged state — it only attaches when
  // the extraction came back with source: 'llm_extracted'.
  const tBadge = useTranslations('provenance.badge.llmExtracted')
  const tAttribution = useTranslations('sakenowaAttribution')
  const router = useRouter()
  // Two distinct file inputs so the visitor gets a deterministic
  // choice between the camera and the photo library on mobile —
  // without depending on the OS to show its (browser- and
  // version-dependent) "Photo Library / Take Photo / Choose File"
  // sheet. The upload input has no `capture` attribute and always
  // opens the picker; the camera input pins `capture="environment"`
  // and always opens the back camera. The camera button itself is
  // hidden on devices without a coarse pointer (desktop without a
  // touchscreen), so the dual layout only shows up where it adds
  // value.
  const uploadInputRef = useRef<HTMLInputElement | null>(null)
  const cameraInputRef = useRef<HTMLInputElement | null>(null)
  const [state, formAction, isActionPending] = useActionState<ScanActionState, FormData>(
    scanAction,
    INITIAL_SCAN_ACTION_STATE,
  )
  const [isDownscaling, setIsDownscaling] = useState(false)
  // Boolean rather than the raw error message — we surface a polite,
  // discovery-framed i18n string ('errorDownscale'), not the raw browser
  // exception, to keep DACH copy on-brand.
  const [downscaleFailed, setDownscaleFailed] = useState(false)
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

  // Auto-navigate only when the matched extraction is in the `auto`
  // confidence tier (≥ 0.85 per PRD #105). Confirm tier (0.60–0.85)
  // renders the confirm card and waits for an explicit tap — see the
  // `matched` JSX branch below. Without this gate the visitor would
  // be silently routed to a sake they're not sure matches.
  useEffect(() => {
    if (state.status !== 'matched') return
    if (resolveConfidenceTier(state.extraction.confidence) !== 'auto') return
    router.push(state.sakeHref)
  }, [router, state])

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

  function onCameraClick() {
    setDownscaleFailed(false)
    cameraInputRef.current?.click()
  }

  // Both buttons share the same handler when the existing UI calls
  // `onPickClick` (rescan paths inside the result branches). Pick the
  // upload one as the default — it works on every device, including
  // desktops without a camera, where the camera input would just
  // fall back to a file picker anyway.
  const onPickClick = onUploadClick

  async function onFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    setDownscaleFailed(false)
    setIsDownscaling(true)
    // New scan attempt — reset the relative-time origin so subsequent
    // events show time since pick. Events accumulate in the app-level
    // store (intentionally NOT cleared here) so the operator can scroll
    // back across multiple attempts.
    scanStartedAtRef.current = Date.now()
    pushClientEvent(`picked file "${file.name}" (${file.size} bytes, ${file.type || 'no MIME'})`)
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
      // Reset both inputs so picking the same file again still fires
      // onChange (browsers suppress duplicate-value events). We don't
      // know which of the two inputs triggered the change handler, so
      // clear both — they're cheap.
      if (uploadInputRef.current) uploadInputRef.current.value = ''
      if (cameraInputRef.current) cameraInputRef.current.value = ''
    }
  }

  const isPending = isDownscaling || isActionPending

  // The form is JS-only: there is no no-JS submit path because the canvas
  // downscale runs in the browser before we ever build the FormData. The
  // `onSubmit` handler exists so the Enter key on the button doesn't fall
  // through to a server post that would receive an empty body.
  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
  }

  return (
    <form
      onSubmit={onSubmit}
      data-testid="scan-form"
      className="flex flex-col items-start gap-4"
    >
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
      <input
        ref={cameraInputRef}
        type="file"
        name="image-picker-camera"
        accept="image/*"
        capture="environment"
        onChange={onFileChange}
        className="sr-only"
        data-testid="scan-camera-input"
        aria-label={t('cameraAriaLabel')}
      />
      <div className="flex flex-wrap items-center gap-2">
        {/*
          Take-photo button is gated on `(any-pointer: coarse)` —
          shows on phones / tablets / touchscreen laptops, hides on
          desktops without touch. On desktop the camera input would
          just fall back to a file picker, duplicating the upload
          button below.
        */}
        <Button
          type="button"
          onClick={onCameraClick}
          disabled={isPending}
          data-testid="scan-camera-button"
          className="hidden [@media(any-pointer:coarse)]:inline-flex"
        >
          {isPending ? t('pending') : t('takePhoto')}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={onUploadClick}
          disabled={isPending}
          data-testid="scan-pick-button"
        >
          {isPending ? t('pending') : t('uploadPhoto')}
        </Button>
      </div>

      {state.status === 'invalid_input' && (
        <p
          role="alert"
          className="text-sm text-amber-700 dark:text-amber-300"
          data-testid="scan-error-invalid-input"
        >
          {t('errorInvalidInput')}
        </p>
      )}
      {state.status === 'rate_limited' && (
        // PRD #105 §"Rate-limit policy v1" + issue #107: discovery /
        // learning copy with the human-friendly retry time. The
        // numeric retryAfterSec is rendered as a rounded-up hours
        // figure via the ICU `plural` message — we deliberately
        // over-estimate (always round up) so the visitor never bumps
        // into the wall again before our reported window closes.
        <p
          role="alert"
          className="text-sm text-amber-700 dark:text-amber-300"
          data-testid="scan-error-rate-limited"
        >
          {t('rateLimited', {
            hours: Math.max(1, Math.ceil(state.retryAfterSec / 3600)),
          })}
        </p>
      )}
      {downscaleFailed && (
        <p
          role="alert"
          className="text-sm text-amber-700 dark:text-amber-300"
          data-testid="scan-error-downscale"
        >
          {t('errorDownscale')}
        </p>
      )}
      {state.status === 'extraction_failed' && (
        // The action wraps the vision call + Sakenowa lookup in a
        // try/catch (see scan-action.ts). Random non-sake images
        // routinely bottom out the AI SDK's schema-validation retries
        // and surface here. Anthropic outages, content moderation
        // rejections, and DB blips share the same UI — the localized
        // copy stays generic; the debug overlay carries the
        // technical name (`AI_RetryError`, `ZodError`, etc.) and a
        // sliced error message.
        <p
          role="alert"
          className="text-sm text-amber-700 dark:text-amber-300"
          data-testid="scan-error-extraction-failed"
        >
          {t('extractionFailed')}
        </p>
      )}
      {state.status === 'low_confidence' && consensus && (
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
              onClick={() => router.push(consensus.sakeHref)}
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
          </div>
        </div>
      )}
      {state.status === 'low_confidence' && !consensus && (
        // Retry tier (confidence < 0.60). No lookup attempted upstream
        // — the model isn't confident enough about the (name, brewery)
        // pair to be worth checking against Sakenowa. We surface a
        // discovery-framed hint ("try a closer shot") plus an explicit
        // rescan button so the visitor doesn't have to scroll back up
        // to the file picker.
        <div
          className="flex flex-col gap-2"
          data-testid="scan-result-retry"
        >
          <p
            role="alert"
            className="text-sm text-amber-700 dark:text-amber-300"
            data-testid="scan-error-low-confidence"
          >
            {t('lowConfidence')}
          </p>
          <div>
            <Button
              type="button"
              variant="outline"
              onClick={onPickClick}
              data-testid="scan-result-retry-rescan"
            >
              {t('retryRescan')}
            </Button>
          </div>
        </div>
      )}
      {state.status === 'no_match' && (
        <p
          className="text-sm text-zinc-700 dark:text-zinc-300"
          data-testid="scan-result-no-match"
        >
          {t('noMatch')}
        </p>
      )}
      {state.status === 'ambiguous' && (() => {
        // Disambiguation list. Each candidate carries its brand
        // kanji + romaji and its brewery info; if every candidate
        // shares the same brewery (common shape from brewery-only
        // ambiguous), the UI surfaces that brewery in the header so
        // the visitor knows *which* brewery they matched.
        const breweryKanjis = new Set(state.candidates.map((c) => c.breweryKanji))
        const sharedBrewery =
          breweryKanjis.size === 1 ? state.candidates[0] : null
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
                ? t('ambiguousSharedBrewery', {
                    breweryKanji: sharedBrewery.breweryKanji,
                    breweryRomaji: sharedBrewery.breweryRomaji ?? '',
                  })
                : t('ambiguous')}
            </p>
            <ul className="flex flex-col gap-1.5" data-testid="scan-result-ambiguous-list">
              {state.candidates.map((c) => (
                <li key={c.brandId}>
                  <a
                    href={c.sakeHref}
                    className="flex flex-col gap-0.5 rounded border border-zinc-200 px-3 py-2 transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
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
                    {!sharedBrewery && (
                      <span className="text-xs text-zinc-500 dark:text-zinc-500 flex items-baseline gap-1 flex-wrap">
                        <span lang="ja">{c.breweryKanji}</span>
                        {c.breweryRomaji && <span>({c.breweryRomaji})</span>}
                      </span>
                    )}
                  </a>
                </li>
              ))}
            </ul>
            <p
              className="text-xs text-zinc-500 dark:text-zinc-500"
              data-testid="scan-result-ambiguous-not-listed"
            >
              {t('ambiguousNotListed')}
            </p>
            <Button
              type="button"
              variant="outline"
              onClick={onPickClick}
              data-testid="scan-result-ambiguous-rescan"
            >
              {t('ambiguousRescan')}
            </Button>
          </div>
        )
      })()}
      {state.status === 'matched' && resolveConfidenceTier(state.extraction.confidence) === 'auto' && (
        // Auto tier (confidence ≥ 0.85). The useEffect above auto-navigates
        // to `state.sakeHref`; this block is the brief flash before the
        // route change resolves. CLAUDE.md "Do NOT show LLM-extracted data
        // without a ProvenanceBadge" — every LLM-extracted value here is
        // rendered adjacent to its badge. The Sakenowa attribution
        // renders too, since the result includes the matched brand id.
        <div
          className="flex flex-col gap-3"
          data-testid="scan-result-matched"
        >
          <SakenowaAttributionView
            placement="inline"
            poweredBy={tAttribution('poweredBy')}
            linkLabel={tAttribution('linkLabel')}
          />
          <div className="flex items-center gap-2">
            <span
              className="text-base font-medium"
              lang="ja"
              data-testid="scan-result-name-ja"
            >
              {state.extraction.name_ja}
            </span>
            <ProvenanceBadgeView
              kind="llmExtracted"
              label={tBadge('label')}
              tooltip={tBadge('tooltip')}
              confidence={state.extraction.confidence}
            />
          </div>
          <p className="text-sm text-zinc-700 dark:text-zinc-300">{t('matched')}</p>
        </div>
      )}
      {state.status === 'matched' && resolveConfidenceTier(state.extraction.confidence) === 'confirm' && (
        // Confirm tier (0.60 ≤ confidence < 0.85). Renders a confirm
        // card: the extracted brand kanji with provenance, a "is this
        // the bottle?" prompt, and explicit Confirm / Rescan
        // actions. NO auto-navigate — the visitor decides. The
        // brewery from the extraction is shown alongside the brand
        // so a misread brewery (caught by brewery-fallback at
        // `matched_brand_only` for divergence) doesn't slip past.
        <div
          className="flex flex-col gap-3"
          data-testid="scan-result-confirm"
        >
          <SakenowaAttributionView
            placement="inline"
            poweredBy={tAttribution('poweredBy')}
            linkLabel={tAttribution('linkLabel')}
          />
          <p className="text-sm text-zinc-700 dark:text-zinc-300">{t('confirmTitle')}</p>
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className="text-base font-medium"
                lang="ja"
                data-testid="scan-result-name-ja"
              >
                {state.extraction.name_ja}
              </span>
              {state.sakeRomaji && (
                <span
                  className="text-sm text-zinc-600 dark:text-zinc-400"
                  data-testid="scan-result-confirm-sake-romaji"
                >
                  ({state.sakeRomaji})
                </span>
              )}
              <ProvenanceBadgeView
                kind="llmExtracted"
                label={tBadge('label')}
                tooltip={tBadge('tooltip')}
                confidence={state.extraction.confidence}
              />
            </div>
            <span
              className="text-sm text-zinc-600 dark:text-zinc-400 flex items-baseline gap-2 flex-wrap"
              data-testid="scan-result-confirm-brewery"
            >
              <span lang="ja">{state.extraction.brewery_ja}</span>
              {state.breweryRomaji && (
                <span data-testid="scan-result-confirm-brewery-romaji">
                  ({state.breweryRomaji})
                </span>
              )}
            </span>
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              onClick={() => router.push(state.sakeHref)}
              data-testid="scan-result-confirm-accept"
            >
              {t('confirmAccept')}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={onPickClick}
              data-testid="scan-result-confirm-rescan"
            >
              {t('confirmRescan')}
            </Button>
          </div>
        </div>
      )}
      {state.status === 'matched_brand_only' && (
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
              {state.sakeKanji}
            </span>
            {state.sakeRomaji && (
              <span
                className="text-sm text-zinc-600 dark:text-zinc-400"
                data-testid="scan-result-matched-brand-only-sake-romaji"
              >
                ({state.sakeRomaji})
              </span>
            )}
            <ProvenanceBadgeView
              kind="llmExtracted"
              label={tBadge('label')}
              tooltip={tBadge('tooltip')}
              confidence={state.extraction.confidence}
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
                extracted: state.breweryDivergence.extracted,
                stored: state.breweryDivergence.stored,
              })}
            </span>
            {state.breweryDivergence.storedRomaji && (
              <>
                {' '}
                <span data-testid="scan-result-brewery-divergence-romaji">
                  ({state.breweryDivergence.storedRomaji})
                </span>
              </>
            )}
          </p>
          <a
            href={state.sakeHref}
            className="text-sm font-medium text-blue-700 underline-offset-2 hover:underline dark:text-blue-300"
            data-testid="scan-result-matched-brand-only-link"
          >
            {t('matchedBrandOnlyOpen')}
          </a>
        </div>
      )}
      {state.status === 'matched_brewery_only' && (
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
              {state.brandDivergence.stored}
            </span>
            {state.brandDivergence.storedRomaji && (
              <span
                className="text-sm text-zinc-600 dark:text-zinc-400"
                data-testid="scan-result-matched-brewery-only-sake-romaji"
              >
                ({state.brandDivergence.storedRomaji})
              </span>
            )}
            <ProvenanceBadgeView
              kind="llmExtracted"
              label={tBadge('label')}
              tooltip={tBadge('tooltip')}
              confidence={state.extraction.confidence}
            />
          </div>
          {state.breweryRomaji && (
            <span
              className="text-sm text-zinc-600 dark:text-zinc-400 flex items-baseline gap-2 flex-wrap"
              data-testid="scan-result-matched-brewery-only-brewery"
            >
              <span lang="ja">{state.extraction.brewery_ja}</span>
              <span>({state.breweryRomaji})</span>
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
                extracted: state.brandDivergence.extracted,
                stored: state.brandDivergence.stored,
              })}
            </span>
            {state.brandDivergence.storedRomaji && (
              <>
                {' '}
                <span data-testid="scan-result-brand-divergence-romaji">
                  ({state.brandDivergence.storedRomaji})
                </span>
              </>
            )}
          </p>
          <a
            href={state.sakeHref}
            className="text-sm font-medium text-blue-700 underline-offset-2 hover:underline dark:text-blue-300"
            data-testid="scan-result-matched-brewery-only-link"
          >
            {t('matchedBreweryOnlyOpen')}
          </a>
        </div>
      )}
    </form>
  )
}
