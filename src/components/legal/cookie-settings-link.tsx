'use client'

import { useTranslations } from 'next-intl'
import { COOKIE_BANNER_OPEN_EVENT } from './cookie-banner-events'

export function CookieSettingsLink() {
  const t = useTranslations('cookieBanner')

  function open() {
    window.dispatchEvent(new Event(COOKIE_BANNER_OPEN_EVENT))
  }

  return (
    <button
      type="button"
      onClick={open}
      data-testid="cookie-settings-link"
      className="text-sm text-zinc-500 underline underline-offset-4 hover:text-zinc-900 dark:hover:text-zinc-50 cursor-pointer"
    >
      {t('settingsLink')}
    </button>
  )
}
