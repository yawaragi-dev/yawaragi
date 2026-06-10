'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { setConsent } from '@/lib/legal/consent-actions'
import type { ConsentDecision } from '@/lib/legal/consent'
import { COOKIE_BANNER_OPEN_EVENT } from './cookie-banner-events'

/**
 * CSS custom property the banner publishes on `<html>` so other
 * bottom-anchored overlays (`<DebugPanel />`, future toasts) can sit
 * above it without colliding. Value is the banner's current rendered
 * height in pixels, kept in sync by a `ResizeObserver` while the
 * banner is open. Cleared when the banner closes.
 */
const COOKIE_BANNER_HEIGHT_CSS_VAR = '--cookie-banner-h'

export function CookieBanner({
  initialDecision,
}: {
  initialDecision: ConsentDecision | null
}) {
  const t = useTranslations('cookieBanner')
  const [isPending, startTransition] = useTransition()
  const [open, setOpen] = useState(initialDecision === null)
  const [customizing, setCustomizing] = useState(initialDecision !== null)
  const [analytics, setAnalytics] = useState(initialDecision?.analytics ?? false)
  const [marketing, setMarketing] = useState(initialDecision?.marketing ?? false)
  const bannerRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    function handleOpen() {
      setOpen(true)
      setCustomizing(true)
    }
    window.addEventListener(COOKIE_BANNER_OPEN_EVENT, handleOpen)
    return () => window.removeEventListener(COOKIE_BANNER_OPEN_EVENT, handleOpen)
  }, [])

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
      setOpen(false)
    })
  }

  if (!open) return null

  return (
    <section
      ref={bannerRef}
      role="region"
      aria-label={t('label')}
      data-testid="cookie-banner"
      className="fixed bottom-0 inset-x-0 z-40 border-t border-border bg-popover text-popover-foreground shadow-2xl"
    >
      <div className="max-w-4xl mx-auto flex flex-col gap-3 px-6 py-4">
        <p className="text-sm">{t('description')}</p>

        {customizing && (
          <fieldset className="flex flex-col gap-2 sm:flex-row sm:gap-6">
            <legend className="sr-only">{t('categoriesLegend')}</legend>
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <input type="checkbox" checked disabled aria-disabled="true" />
              {t('categoryNecessary')}
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={analytics}
                onChange={(e) => setAnalytics(e.target.checked)}
                data-testid="cookie-category-analytics"
              />
              {t('categoryAnalytics')}
            </label>
            <label className="flex items-center gap-2 text-sm">
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

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          {customizing ? (
            <Button
              onClick={() => save({ analytics, marketing })}
              disabled={isPending}
              data-testid="cookie-banner-save"
            >
              {t('savePreferences')}
            </Button>
          ) : (
            <>
              <Button
                variant="outline"
                onClick={() => setCustomizing(true)}
                disabled={isPending}
                data-testid="cookie-banner-customize"
              >
                {t('customize')}
              </Button>
              <Button
                variant="outline"
                onClick={() => save({ analytics: false, marketing: false })}
                disabled={isPending}
                data-testid="cookie-banner-reject"
              >
                {t('rejectNonEssential')}
              </Button>
              <Button
                onClick={() => save({ analytics: true, marketing: true })}
                disabled={isPending}
                data-testid="cookie-banner-accept"
              >
                {t('acceptAll')}
              </Button>
            </>
          )}
        </div>
      </div>
    </section>
  )
}
