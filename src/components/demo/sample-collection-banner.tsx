import { getLocale, getTranslations } from 'next-intl/server'

/**
 * The line across the top of the app while a visitor looks through the
 * sample collection: what they are looking at, and the way out. Present on
 * every screen of the shell, so a sample journal is never mistaken for the
 * visitor's own.
 *
 * "Leave" is a plain link, not `<Link>`: it changes a cookie, and a prefetch
 * must not.
 */
export async function SampleCollectionBanner() {
  const t = await getTranslations('sampleCollection')
  const locale = await getLocale()
  return (
    <div
      className="flex items-center gap-3 border-b border-divider bg-surface px-5 py-2"
      role="status"
      data-testid="sample-collection-banner"
    >
      <p className="min-w-0 flex-1 text-meta text-ash-700">
        <span className="font-medium text-ink">{t('bannerTitle')}</span> · {t('bannerBody')}
      </p>
      <a
        href={`/api/sample-collection?locale=${locale}&leave=1`}
        className="flex min-h-9 shrink-0 items-center rounded-md px-2 text-meta font-medium text-ginshu-700 hover:text-ginshu-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ginshu-600"
        data-testid="sample-collection-leave"
      >
        {t('leave')}
      </a>
    </div>
  )
}
