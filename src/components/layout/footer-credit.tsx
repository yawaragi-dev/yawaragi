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
 */
export function FooterCredit() {
  const t = useTranslations('sakenowaAttribution')
  const pathname = usePathname()
  if (pathname === '/account' || pathname.startsWith('/account/')) return null
  return (
    <SakenowaAttributionView
      placement="end"
      poweredBy={t('poweredBy')}
      linkLabel={t('linkLabel')}
      catalogueData={t('catalogueData')}
    />
  )
}
