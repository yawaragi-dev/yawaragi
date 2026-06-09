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
import type { Locale } from '@/i18n/routing'

interface ScanFormProps {
  locale: Locale
}

/**
 * `<ScanForm />` — the client-side capture surface for Phase 3 / S1.
 *
 * Flow (PRD #105 §"Wire shape"):
 *   1. Visitor taps the button → the hidden `<input type="file"
 *      accept="image/*" capture="environment">` opens the OS camera
 *      (mobile) or file picker (desktop).
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
export function ScanForm({ locale }: ScanFormProps) {
  const t = useTranslations('scan.form')
  // ProvenanceBadgeView + SakenowaAttributionView are the sync presentational
  // halves; we resolve their strings via the client-side translator since this
  // module is `'use client'`. The badge's policy (don't render canonical
  // sources) is enforced by the action's tagged state — it only attaches when
  // the extraction came back with source: 'llm_extracted'.
  const tBadge = useTranslations('provenance.badge.llmExtracted')
  const tAttribution = useTranslations('sakenowaAttribution')
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [state, formAction, isActionPending] = useActionState<ScanActionState, FormData>(
    scanAction,
    INITIAL_SCAN_ACTION_STATE,
  )
  const [isDownscaling, setIsDownscaling] = useState(false)
  // Boolean rather than the raw error message — we surface a polite,
  // discovery-framed i18n string ('errorDownscale'), not the raw browser
  // exception, to keep DACH copy on-brand.
  const [downscaleFailed, setDownscaleFailed] = useState(false)

  // After a successful match, navigate to the sake detail page. We don't
  // render anything in the matched-state branch because the next paint is
  // the destination page; the badge + attribution already live there.
  useEffect(() => {
    if (state.status === 'matched') {
      router.push(state.sakeHref)
    }
  }, [router, state])

  function onPickClick() {
    setDownscaleFailed(false)
    inputRef.current?.click()
  }

  async function onFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    setDownscaleFailed(false)
    setIsDownscaling(true)
    try {
      const downscaled = await downscaleImage(file, {
        decode: browserBitmapDecoder,
        createContext: browserCanvasFactory,
      })
      const formData = new FormData()
      formData.set('image', downscaled, 'label.jpg')
      formData.set('locale', locale)
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
    } finally {
      setIsDownscaling(false)
      // Reset the input so picking the same file again still fires
      // onChange (browsers suppress duplicate-value events).
      if (inputRef.current) inputRef.current.value = ''
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
        ref={inputRef}
        type="file"
        name="image-picker"
        accept="image/*"
        capture="environment"
        onChange={onFileChange}
        className="sr-only"
        data-testid="scan-file-input"
        aria-label={t('inputAriaLabel')}
      />
      <Button
        type="button"
        onClick={onPickClick}
        disabled={isPending}
        data-testid="scan-pick-button"
      >
        {isPending ? t('pending') : t('pickLabel')}
      </Button>

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
      {state.status === 'low_confidence' && (
        // Phase 3 / S3 (#108) placeholder. S4 (#109) replaces this with
        // the three-tier auto / confirm / retry UI; for now we render a
        // single discovery-framed hint that nudges the visitor toward a
        // clearer photo. The extraction is on the state but deliberately
        // not displayed yet — S4 owns the confirm-card design.
        <p
          role="alert"
          className="text-sm text-amber-700 dark:text-amber-300"
          data-testid="scan-error-low-confidence"
        >
          {t('lowConfidence')}
        </p>
      )}
      {state.status === 'no_match' && (
        <p
          className="text-sm text-zinc-700 dark:text-zinc-300"
          data-testid="scan-result-no-match"
        >
          {t('noMatch')}
        </p>
      )}
      {state.status === 'ambiguous' && (
        <p
          className="text-sm text-zinc-700 dark:text-zinc-300"
          data-testid="scan-result-ambiguous"
        >
          {t('ambiguous')}
        </p>
      )}
      {state.status === 'matched' && (
        // The matched-state UI is visible briefly before the router push
        // resolves. CLAUDE.md "Do NOT show LLM-extracted data without a
        // ProvenanceBadge" — every LLM-extracted value here is rendered
        // adjacent to its badge. The Sakenowa attribution renders too,
        // since the result includes the Sakenowa-matched brand id.
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
    </form>
  )
}
