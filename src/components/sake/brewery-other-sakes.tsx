import { getTranslations } from 'next-intl/server'
import { Link } from '@/i18n/navigation'
import { listSiblingBrands } from '@/lib/sakenowa/lookup'
import { RomajiDisclosure } from '@/components/sake/romaji-disclosure'

/**
 * The brewery's other sakes — design v1.4 §9.9.
 *
 * This is the fix for a dead end a visitor hit in testing (#325): search
 * "dassai", land on one Dassai, and there is no route to any of the others the
 * same brewery makes. 781 of the catalogue's 1,354 breweries publish more than
 * one brand, so the missing link affected most bottles.
 *
 * Renders nothing when the brewery publishes only this one — §9.9's "Hidden
 * without data". An empty "other sakes" heading would be worse than silence,
 * because unlike §9's other sections there is no fact to state: the brewery
 * has not withheld anything.
 *
 * A horizontal row, as the design draws it, not a list: these are siblings to
 * glance across, and a vertical list of eight would push the sections below it
 * off a 390px screen. The row scrolls on overflow and each chip is a 44px
 * touch target.
 */
export async function BreweryOtherSakes({
  brandId,
  instanceId,
}: {
  /** The brand whose siblings to show. Excluded from its own row. */
  brandId: number
  /** Disambiguates the disclosure's element ids on a page with several. */
  instanceId: string
}) {
  const t = await getTranslations('sake.brand')
  const siblings = await safeListSiblingBrands(brandId)
  if (siblings.length === 0) return null

  return (
    <div className="flex flex-col gap-2" data-testid="brewery-other-sakes">
      <p className="text-body text-ash-600">{t('otherSakesIntro')}</p>
      {/*
        `-mx-5 px-5` lets the row bleed to the screen edge while keeping its
        first and last chip on the page's gutter, so a half-visible chip at the
        edge reads as "there is more" rather than as a layout bug.
      */}
      <ul className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1" role="list">
        {siblings.map((sibling) => (
          <li key={sibling.brandId} className="shrink-0">
            <Link
              href={{
                pathname: '/sake/[brandId]',
                params: { brandId: String(sibling.brandId) },
              }}
              data-testid={`brewery-other-sake-${sibling.brandId}`}
              className="flex min-h-11 flex-col justify-center rounded-xl bg-surface px-3.5 py-2 shadow-yw-sm transition-colors hover:bg-ash-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ginshu-600"
            >
              {/*
                Romaji first where we have it, kanji under it — the same name
                order §9.1 gives the bottle's own name, so a visitor reading
                down the page does not meet two conventions.

                `data-romaji-field` marks these as romaji for the e2e's
                badge-placement check. There is no badge inside: the row's
                single `<RomajiDisclosure />` below covers all of them, which
                is why the attribute is on the span that holds the name rather
                than on one that holds a chip.
              */}
              {sibling.nameRomaji !== null ? (
                <>
                  <span
                    className="text-card-heading font-medium text-ink"
                    lang="en"
                    data-romaji-field=""
                  >
                    {sibling.nameRomaji}
                  </span>
                  <span className="text-meta text-ash-600" lang="ja">
                    {sibling.nameKanji}
                  </span>
                </>
              ) : (
                <span className="text-card-heading font-medium text-ink" lang="ja">
                  {sibling.nameKanji}
                </span>
              )}
            </Link>
          </li>
        ))}
      </ul>
      {/*
        One disclosure for the row, not one badge per chip — see
        `<RomajiDisclosure />`. Rendered only when at least one chip actually
        shows a romaji name, so a brewery whose siblings have no
        transliteration yet does not carry a caveat about something absent.
      */}
      {siblings.some((sibling) => sibling.nameRomaji !== null) && (
        <RomajiDisclosure id={`${instanceId}-other-sakes-romaji`} />
      )}
    </div>
  )
}

/**
 * The siblings row is secondary content on a page whose primary content has
 * already loaded. A mirror hiccup here should cost the visitor this row, not
 * the bottle — so unlike the brand lookup (without which there is no page)
 * this one degrades to "the brewery publishes nothing else", which is also
 * what a brewery with one brand looks like.
 */
async function safeListSiblingBrands(brandId: number) {
  try {
    return await listSiblingBrands(brandId)
  } catch {
    return []
  }
}
