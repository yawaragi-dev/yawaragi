import { Link } from '@/i18n/navigation'
import { listSiblingBrands } from '@/lib/sakenowa/lookup'
import type { Brand } from '@/lib/schemas/brand'

/**
 * The brewery's other sakes — design v1.4 §9.9.
 *
 * This is the fix for a dead end a visitor hit in testing (#325): search
 * "dassai", land on one Dassai, and there is no route to any of the others the
 * same brewery makes. 781 of the catalogue's 1,354 breweries publish more than
 * one brand, so the missing link affected most bottles.
 *
 * The page fetches the siblings (`listSiblingBrandsSafe`) rather than this
 * component, because the page needs them first: with none, §9.9 is "Hidden
 * without data" as a whole section, and whether the section's one romaji
 * disclosure is needed depends on the chips as well as the brewery name.
 *
 * A horizontal row, as the design draws it, not a list: these are siblings to
 * glance across, and a vertical list of eight would push the sections below it
 * off a 390px screen. The row scrolls on overflow and each chip is a 44px
 * touch target.
 */
export function BreweryOtherSakes({
  siblings,
  intro,
}: {
  /** The brewery's other brands, this one excluded. Never empty. */
  siblings: readonly Brand[]
  /** "Also from this brewery". */
  intro: string
}) {
  return (
    <div className="flex flex-col gap-2" data-testid="brewery-other-sakes">
      <p className="text-body text-ash-600">{intro}</p>
      {/*
        v1.5 rule 7, the horizontal-row edge: the row bleeds to the screen
        edge, the trailing 32px fade out (a mask, not an overlay), 48px of
        trailing padding lets the last card scroll clear of the fade, and
        cards snap to their starts.
      */}
      <ul
        className="-mx-5 flex snap-x snap-proximity scroll-pl-5 gap-2 overflow-x-auto pr-12 pb-1 pl-5 [mask-image:linear-gradient(to_right,#000_calc(100%-32px),transparent)]"
        role="list"
      >
        {siblings.map((sibling) => (
          <li key={sibling.brandId} className="shrink-0 snap-start">
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
                badge-placement check. There is no badge inside: the section's
                single `<RomajiDisclosure />` covers all of them, which
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
export async function listSiblingBrandsSafe(brandId: number): Promise<readonly Brand[]> {
  try {
    return await listSiblingBrands(brandId)
  } catch {
    return []
  }
}
