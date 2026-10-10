import { getTranslations } from 'next-intl/server'
import { CaretRight } from '@phosphor-icons/react/dist/ssr'
import { Link } from '@/i18n/navigation'
import { AddBottlingRow } from '@/components/sake/add-bottling-row'
import { BottleSection } from '@/components/sake/bottle-section'
import type { Expression } from '@/lib/schemas/expression'

/**
 * §9.3a Bottlings, in the two states that exist at launch (design v1.6.1):
 *
 * - **None known (screenshot 63):** no heading, no list — the dashed "Add your
 *   bottling" row stands alone. It is the only place to start a bottling of a
 *   sake the catalogue has.
 * - **Only the visitor's own (64):** "Your bottlings" with a count, a row per
 *   bottling reading "Your own entry", then "Add your bottling".
 *
 * The third state, "Bottlings we know", needs catalogue bottlings, and there
 * are none: Sakenowa has no such level and nothing is curated yet.
 *
 * Rendered only for a visitor who can keep a journal (ADR-0020).
 */
export async function OwnBottlings({
  brandId,
  lineName,
  bottlings,
  tastedIds,
}: {
  brandId: number
  /** The sake's name as the page shows it; it prefills the form. */
  lineName: string
  /** The visitor's own bottlings of this sake, oldest first. */
  bottlings: readonly Expression[]
  /** Which of them have a tasting logged. */
  tastedIds: ReadonlySet<string>
}) {
  const t = await getTranslations('bottling')
  const add = <AddBottlingRow brandId={brandId} lineName={lineName} />

  if (bottlings.length === 0) {
    return <div data-testid="bottle-bottlings">{add}</div>
  }

  return (
    <BottleSection
      label={t('yourBottlings')}
      caption={t('count', { n: bottlings.length })}
      testId="bottle-bottlings"
    >
      <ul className="flex flex-col" role="list">
        {bottlings.map((bottling) => (
          <li key={bottling.id} className="border-b border-divider">
            <Link
              href={{ pathname: '/bottling/[id]', params: { id: bottling.id } }}
              className="flex min-h-14 items-center gap-3 py-2.5 transition-colors hover:bg-ash-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ginshu-600"
              data-testid={`own-bottling-link-${bottling.id}`}
            >
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-card-heading font-medium text-ink">{bottling.name}</span>
                <span className="text-meta text-ash-700">{t('ownEntry')}</span>
              </span>
              {tastedIds.has(bottling.id) && (
                <span className="shrink-0 rounded-full bg-ginshu-100 px-2.5 py-0.5 text-meta text-ginshu-700">
                  {t('tasted')}
                </span>
              )}
              <CaretRight size={16} className="shrink-0 text-ash-600" aria-hidden="true" />
            </Link>
          </li>
        ))}
      </ul>
      <div className="pt-2">{add}</div>
    </BottleSection>
  )
}
