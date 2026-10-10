'use client'

import { useTranslations } from 'next-intl'
import { SakenowaAttributionView } from '@/components/sake/sakenowa-attribution'
import { usePathname } from '@/i18n/navigation'

/**
 * Line 1 of v1.5's end-of-screen block (rule 15): "Catalogue and flavor data
 * · Powered by Sakenowa ↗". On every scrolling app screen except Account,
 * which rule 15 gives line 2 only — Account shows no catalogue data.
 *
 * A client component only for the pathname: the footer lives in the app
 * shell, which does not know which screen it is under.
 *
 * v1.6.1 narrows rule 15: the line shows "only when the screen displays
 * catalogue or chart data", so Sakenowa is never credited for hand-written or
 * user-typed content. Which screens those are depends on their data, not
 * their path — a bottling the visitor added has a sake behind it or it has
 * not. Such a screen marks itself with `data-no-catalogue-data`, and one rule
 * in `globals.css` hides the `data-footer-credit` wrapper below. CSS rather
 * than a message to this component, so the line is right in the first paint
 * and there is nothing to hydrate before it is.
 */
export function FooterCredit() {
  const t = useTranslations('sakenowaAttribution')
  const pathname = usePathname()
  if (pathname === '/account' || pathname.startsWith('/account/')) return null
  return (
    <div data-footer-credit="">
      <SakenowaAttributionView
        placement="end"
        poweredBy={t('poweredBy')}
        linkLabel={t('linkLabel')}
        catalogueData={t('catalogueData')}
      />
    </div>
  )
}
