'use client'

import { useTranslations } from 'next-intl'
import { requestCookiePreferences } from './cookie-banner-events'

// The landing footer sets these links at 12px; the app footer at 11px, to fit
// one row at 390px (see `legal-footer.tsx`). Hence the override.
const DEFAULT_CLASS_NAME =
  'text-meta text-ash-600 underline underline-offset-4 hover:text-ash-800 cursor-pointer'

export function CookieSettingsLink({ className = DEFAULT_CLASS_NAME }: { className?: string }) {
  const t = useTranslations('cookieBanner')

  return (
    <button
      type="button"
      onClick={requestCookiePreferences}
      data-testid="cookie-settings-link"
      // Ginshu ramp, matching the Impressum and Privacy links it sits beside:
      // this rendered a cooler, lighter grey than both, which made the one
      // control in the footer look like the least important thing in it. The
      // light-mode half was dead on arrival (ADR-0023 makes `dark:` always
      // match), so it goes rather than getting a second colour.
      className={className}
    >
      {t('settingsLink')}
    </button>
  )
}
