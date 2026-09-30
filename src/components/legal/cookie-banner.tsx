'use client'

import { useEffect, useRef, useState, useSyncExternalStore, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'
import { setConsent } from '@/lib/legal/consent-actions'
import type { ConsentDecision } from '@/lib/legal/consent'
import {
  clearCookiePreferencesRequest,
  isCookiePreferencesRequested,
  isCookiePreferencesRequestedOnServer,
  subscribeCookiePreferences,
} from './cookie-banner-events'

/**
 * CSS custom property the banner publishes on `<html>` so other
 * bottom-anchored overlays (`<DebugPanel />`, future toasts) can sit
 * above it without colliding. Value is the banner's current rendered
 * height in pixels, kept in sync by a `ResizeObserver` while the
 * banner is open. Cleared when the banner closes.
 */
const COOKIE_BANNER_HEIGHT_CSS_VAR = '--cookie-banner-h'

/**
 * Where the banner sits, which differs by route group.
 *
 * `app` — §2: 10px from the sides, the tab bar's height from the bottom so it
 *   clears the tab
 * bar**. `site` — §0: a 560px card centred 16px above the bottom edge, because
 * the landing has no tab bar to clear. One consent covers both (same cookie,
 * same domain); only the geometry differs.
 */
export type CookieBannerPlacement = 'app' | 'site'

export function CookieBanner({
  initialDecision,
  placement = 'app',
}: {
  initialDecision: ConsentDecision | null
  placement?: CookieBannerPlacement
}) {
  const t = useTranslations('cookieBanner')
  const [isPending, startTransition] = useTransition()
  // Read during render, not heard in an effect: a reopen request made before
  // this component's first client render is already in the snapshot that
  // render reads, so the banner comes up open instead of one render late — or
  // never, if the request predated the old `window` listener. See
  // `cookie-banner-events.ts`.
  const reopenRequested = useSyncExternalStore(
    subscribeCookiePreferences,
    isCookiePreferencesRequested,
    isCookiePreferencesRequestedOnServer,
  )
  const [dismissed, setDismissed] = useState(initialDecision !== null)
  const [customizingChoice, setCustomizingChoice] = useState(initialDecision !== null)

  // A request forces both: §15 says the row "reopens the cookie banner in
  // Customise", and ADR-0009's "withdraw as easily as give" means landing on
  // the choices rather than a fresh accept/reject prompt.
  const open = reopenRequested || !dismissed
  const customizing = reopenRequested || customizingChoice
  const [analytics, setAnalytics] = useState(initialDecision?.analytics ?? false)
  const [marketing, setMarketing] = useState(initialDecision?.marketing ?? false)
  const bannerRef = useRef<HTMLElement | null>(null)

  // Publish the banner's rendered height so other fixed bottom
  // overlays can stack above it. Falls back to 0 (no offset needed)
  // when the banner is closed.
  useEffect(() => {
    if (!open) {
      document.documentElement.style.removeProperty(COOKIE_BANNER_HEIGHT_CSS_VAR)
      return
    }
    const el = bannerRef.current
    if (!el) return

    const update = () => {
      document.documentElement.style.setProperty(
        COOKIE_BANNER_HEIGHT_CSS_VAR,
        `${el.offsetHeight}px`,
      )
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(el)

    return () => {
      observer.disconnect()
      document.documentElement.style.removeProperty(COOKIE_BANNER_HEIGHT_CSS_VAR)
    }
  }, [open, customizing])

  function save(choice: { analytics: boolean; marketing: boolean }) {
    startTransition(async () => {
      await setConsent(choice)
      setAnalytics(choice.analytics)
      setMarketing(choice.marketing)
      setDismissed(true)
      // Without this the request would hold the banner open against the
      // visitor's own save.
      clearCookiePreferencesRequest()
    })
  }

  if (!open) return null

  return (
    <section
      ref={bannerRef}
      role="region"
      aria-label={t('label')}
      data-testid="cookie-banner"
      data-placement={placement}
      // §2 / §0: a card floating above the bottom edge, not a full-width bar.
      // It deliberately does NOT block the screen behind it — the design says
      // so, and a consent prompt that blocks the product is a dark pattern in
      // its own right.
      className={cn(
        'fixed inset-x-2.5 z-40 rounded-xl bg-surface p-3.5 shadow-yw-lg',
        placement === 'app' ? 'bottom-[var(--tab-bar-h)]' : 'bottom-4 mx-auto max-w-[560px]',
      )}
    >
      <div className="flex flex-col gap-3">
        <h2 className="text-card-heading font-medium text-ink">
          {/* §2: expanding Customise renames the card in place rather than
              opening a second surface. */}
          {customizing ? t('customizeTitle') : t('title')}
        </h2>
        <p className="text-meta text-ash-600">{t('description')}</p>

        {customizing && (
          <fieldset className="flex flex-col gap-2">
            <legend className="sr-only">{t('categoriesLegend')}</legend>
            <label className="flex items-center gap-2 text-meta text-ash-600">
              <input type="checkbox" checked disabled aria-disabled="true" />
              {t('categoryNecessary')}
            </label>
            <label className="flex items-center gap-2 text-meta text-ink">
              <input
                type="checkbox"
                checked={analytics}
                onChange={(e) => setAnalytics(e.target.checked)}
                data-testid="cookie-category-analytics"
              />
              {t('categoryAnalytics')}
            </label>
            <label className="flex items-center gap-2 text-meta text-ink">
              <input
                type="checkbox"
                checked={marketing}
                onChange={(e) => setMarketing(e.target.checked)}
                data-testid="cookie-category-marketing"
              />
              {t('categoryMarketing')}
            </label>
          </fieldset>
        )}

        {/* §2: a three-column grid of buttons at **identical size and style**.
            That is not only the design — GDPR requires Accept and Reject at
            equal prominence, and the previous layout gave Accept the filled
            `default` variant while Reject and Customise were outlined. */}
        <div className="grid grid-cols-3 gap-2">
          {customizing ? (
            <>
              <ConsentButton
                onClick={() => save({ analytics: false, marketing: false })}
                disabled={isPending}
                testId="cookie-banner-reject"
                label={t('rejectNonEssential')}
              />
              <ConsentButton
                onClick={() => save({ analytics, marketing })}
                disabled={isPending}
                testId="cookie-banner-save"
                label={t('savePreferences')}
              />
              <ConsentButton
                onClick={() => save({ analytics: true, marketing: true })}
                disabled={isPending}
                testId="cookie-banner-accept"
                label={t('acceptAll')}
              />
            </>
          ) : (
            <>
              <ConsentButton
                onClick={() => save({ analytics: false, marketing: false })}
                disabled={isPending}
                testId="cookie-banner-reject"
                label={t('rejectNonEssential')}
              />
              <ConsentButton
                onClick={() => setCustomizingChoice(true)}
                disabled={isPending}
                testId="cookie-banner-customize"
                label={t('customize')}
              />
              <ConsentButton
                onClick={() => save({ analytics: true, marketing: true })}
                disabled={isPending}
                testId="cookie-banner-accept"
                label={t('acceptAll')}
              />
            </>
          )}
        </div>
      </div>
    </section>
  )
}

interface ConsentButtonProps {
  onClick: () => void
  disabled: boolean
  testId: string
  label: string
}

/**
 * One of the three consent controls. A local component rather than the shared
 * `<Button>` because the whole point is that all three are **indistinguishable
 * from each other** — same 42px height, same fill, same weight. Reaching for
 * `<Button variant>` is how one of them quietly becomes more prominent than
 * the others again, which is the dark pattern GDPR names.
 */
function ConsentButton({ onClick, disabled, testId, label }: ConsentButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      data-testid={testId}
      className="h-[42px] rounded-lg bg-ash-200 px-2 text-meta font-medium text-ink transition-colors hover:bg-ash-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ginshu-600 disabled:opacity-60"
    >
      {label}
    </button>
  )
}
