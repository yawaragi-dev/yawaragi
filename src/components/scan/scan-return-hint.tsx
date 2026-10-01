import { useTranslations } from 'next-intl'
import { Link } from '@/i18n/navigation'

/**
 * "Not the bottle you scanned? Scan again" escape hatch on `/sake/[brandId]`
 * (issue #109 PR B) — the dead-end recovery for a visitor who matched or
 * picked the wrong sake.
 *
 * The page renders it only when the link that brought the visitor carried
 * `?from=scan` (`hasArrivedViaScan`). That decision is the server's, so the
 * hint is part of the first paint: it used to be a client component reading a
 * sessionStorage flag after hydration, and the whole page shifted down a line
 * once it appeared.
 */
export function ScanReturnHint() {
  const t = useTranslations('scan.returnHint')

  return (
    <p
      className="flex flex-wrap items-baseline gap-2 text-body text-ash-600"
      data-testid="scan-return-hint"
    >
      <span>{t('notThisOne')}</span>
      <Link
        href="/scan"
        className="font-medium text-ink underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ginshu-600"
        data-testid="scan-return-hint-link"
      >
        {t('scanAgain')}
      </Link>
    </p>
  )
}
