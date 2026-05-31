import { getTranslations } from 'next-intl/server'
import { cn } from '@/lib/utils'

/**
 * Sakenowa's attribution-only licence requires a visible credit on every
 * surface that displays its data; footer attribution is explicitly NOT
 * sufficient (CLAUDE.md "Sakenowa attribution", PRE-GO-LIVE §1.2).
 *
 * Two variants share the same canonical phrase + link so the licence
 * obligation is satisfied identically regardless of placement:
 *
 *   above-fold — bordered banner pinned at the top of dedicated detail
 *                pages (e.g. /sake/[brandId]).
 *   inline     — small chip for cards / list items where Sakenowa is one
 *                of multiple sources (Phase 3+ chat / scan / list pages).
 *
 * Split into a sync presentational view + async i18n wrapper because
 * Vitest can't render async RSCs (CLAUDE.md). The view takes resolved
 * strings; unit tests target it. The wrapper does the locale work.
 *
 * "Sakenowa" is a proper noun and is preserved verbatim across locales,
 * including inside the otherwise-translated "Powered by" phrase.
 */

const SAKENOWA_URL = 'https://sakenowa.com'

export type SakenowaAttributionPlacement = 'above-fold' | 'inline'

interface SakenowaAttributionProps {
  placement: SakenowaAttributionPlacement
  className?: string
}

export async function SakenowaAttribution({ placement, className }: SakenowaAttributionProps) {
  const t = await getTranslations('sakenowaAttribution')
  return (
    <SakenowaAttributionView
      placement={placement}
      poweredBy={t('poweredBy')}
      linkLabel={t('linkLabel')}
      className={className}
    />
  )
}

interface SakenowaAttributionViewProps {
  placement: SakenowaAttributionPlacement
  poweredBy: string
  linkLabel: string
  className?: string
}

export function SakenowaAttributionView({
  placement,
  poweredBy,
  linkLabel,
  className,
}: SakenowaAttributionViewProps) {
  const isAboveFold = placement === 'above-fold'
  const testId =
    placement === 'above-fold'
      ? 'sakenowa-attribution-above-fold'
      : 'sakenowa-attribution-inline'

  return (
    <aside
      className={cn(
        isAboveFold
          ? 'flex w-full items-center justify-between gap-3 rounded-md border border-zinc-200 bg-zinc-50 px-4 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-900'
          : 'inline-flex items-center gap-1 text-xs text-zinc-600 dark:text-zinc-400',
        className,
      )}
      data-testid={testId}
      aria-label={poweredBy}
    >
      <span className={isAboveFold ? 'font-medium' : undefined}>{poweredBy}</span>
      <a
        href={SAKENOWA_URL}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={linkLabel}
        className="underline underline-offset-4 hover:no-underline focus-visible:no-underline"
      >
        {linkLabel}
      </a>
    </aside>
  )
}
