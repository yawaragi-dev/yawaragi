'use client'

// `'use client'` is load-bearing: this component reads `sessionStorage`
// (a browser-only API) to decide whether the visitor reached this sake
// page by tapping a scan result. It renders nothing on the server and
// on the first client paint (so there is no hydration mismatch), then
// reveals the affordance after the mount effect reads the marker.

import { useSyncExternalStore } from 'react'
import { useTranslations } from 'next-intl'
import { Link } from '@/i18n/navigation'
import { hasArrivedViaScan } from '@/lib/scan/arrived-via-scan'

// The marker is written on the PREVIOUS page (a scan surface) before
// this page mounts, so it never changes during this page's lifetime — a
// no-op subscribe satisfies the useSyncExternalStore contract. The
// server snapshot is always `false` (no sessionStorage on the server),
// which matches the first client render and avoids a hydration mismatch;
// React then re-reads the client snapshot to reveal the affordance.
const noopSubscribe = () => () => {}
const serverSnapshot = () => false

/**
 * "Not the bottle you scanned? Scan again" escape hatch on
 * `/sake/[brandId]` (issue #109 PR B). Shown only when the visitor
 * arrived from a scan result in this tab — the dead-end recovery for a
 * visitor who matched or picked the wrong sake. A direct navigator
 * (deep link, ranking list, "find similar") never sees it.
 *
 * The marker is a per-tab `sessionStorage` flag set by the scan result
 * surfaces (see `@/lib/scan/arrived-via-scan`); no cookie, no server
 * round-trip, no personal data.
 */
export function ScanReturnHint() {
  const t = useTranslations('scan.returnHint')
  const show = useSyncExternalStore(noopSubscribe, hasArrivedViaScan, serverSnapshot)

  if (!show) return null

  return (
    <p
      className="flex flex-wrap items-baseline gap-2 text-sm text-zinc-600 dark:text-zinc-400"
      data-testid="scan-return-hint"
    >
      <span>{t('notThisOne')}</span>
      <Link
        href="/scan"
        className="font-medium underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
        data-testid="scan-return-hint-link"
      >
        {t('scanAgain')}
      </Link>
    </p>
  )
}
