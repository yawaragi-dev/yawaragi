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

/**
 * Per ADR-0014: pages render `<SakenowaAttribution />` only when at
 * least one of the records they actually rendered has a source that
 * requires Sakenowa attribution. Pages collect rendered sources
 * into a Set and call `requiresSakenowaAttribution(sources)` before
 * mounting the component.
 *
 * Generic by design: when a future source comes with its own
 * attribution clause (NTA brewery maps, Wikidata CC-BY, etc.), the
 * same pattern adds a sibling predicate + sibling attribution
 * component without touching this one.
 */
export const SAKENOWA_ATTRIBUTION_SOURCES = new Set<string>([
  'sakenowa',
  'sakenowa_inferred',
])

export function requiresSakenowaAttribution(
  sources: Iterable<string | null | undefined>,
): boolean {
  for (const s of sources) {
    if (s !== null && s !== undefined && SAKENOWA_ATTRIBUTION_SOURCES.has(s)) {
      return true
    }
  }
  return false
}

/**
 * - `above-fold` — its own panel at the top of a detail page.
 * - `inline` — inside a card or beside one line of a list.
 * - `end` — the last line of a screen's content, directly above the legal
 *   footer, on the same column and in the same quiet type, so the two read
 *   as one end-of-screen block on every screen that has it.
 */
export type SakenowaAttributionPlacement = 'above-fold' | 'inline' | 'end'

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
  // above-fold is a discrete attribution region — `<aside>` (a
  // "complementary" landmark) reads naturally to a screen-reader user
  // skipping by landmark. inline lives inside the flow of a card / list
  // item, so it's a `<span>` to avoid landmark inflation in the document
  // outline. Both render the same visible phrase + link.
  const visibleText = (
    <>
      <span className={placement === 'above-fold' ? 'font-medium' : undefined}>
        {poweredBy}
      </span>
      <a
        href={SAKENOWA_URL}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={linkLabel}
        className="underline underline-offset-4 hover:no-underline focus-visible:no-underline"
      >
        {linkLabel}
      </a>
    </>
  )

  if (placement === 'above-fold') {
    return (
      <aside
        className={cn(
          // Ginshu (design v1.4): a surface panel with the hairline the
          // design calls `shadow-sm`, not a bordered zinc box. The pre-Ginshu
          // treatment rendered its `dark:` branch for everyone once #303
          // forced the variant, which put a cold `zinc-900` slab on the warm
          // `#1b1a19` ground — the "this page isn't in our colour scheme"
          // report. Placement is a separate question and is open with the
          // designers (#308): ADR-0014 wants attribution above the fold on a
          // detail page, §17 draws it as a caption under the chart.
          'flex w-full items-center justify-between gap-3 rounded-xl bg-surface px-4 py-2 text-subtle text-ash-600 shadow-yw-sm',
          className,
        )}
        data-testid="sakenowa-attribution-above-fold"
      >
        {visibleText}
      </aside>
    )
  }

  if (placement === 'end') {
    return (
      <p
        className={cn('flex flex-wrap items-center gap-x-1.5 text-meta text-ash-600', className)}
        data-testid="sakenowa-attribution-end"
      >
        {visibleText}
      </p>
    )
  }

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 text-meta text-ash-600',
        className,
      )}
      data-testid="sakenowa-attribution-inline"
    >
      {visibleText}
    </span>
  )
}
