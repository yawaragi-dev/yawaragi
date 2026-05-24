'use client'

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { setConsent } from '@/lib/legal/consent-actions'

export function CookieBanner() {
  const t = useTranslations('cookieBanner')
  const [isPending, startTransition] = useTransition()
  const [customizing, setCustomizing] = useState(false)
  const [analytics, setAnalytics] = useState(false)
  const [marketing, setMarketing] = useState(false)

  function save(choice: { analytics: boolean; marketing: boolean }) {
    startTransition(async () => {
      await setConsent(choice)
    })
  }

  return (
    <section
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
