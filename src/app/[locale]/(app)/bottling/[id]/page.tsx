import { cookies } from 'next/headers'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { CaretRight } from '@phosphor-icons/react/dist/ssr'
import { Link } from '@/i18n/navigation'
import { ScreenBar } from '@/components/layout/screen-header'
import { BottleHistory } from '@/components/sake/bottle-history'
import { BottleRateRow } from '@/components/sake/bottle-rate-row'
import { BottleSection } from '@/components/sake/bottle-section'
import { LineBlock } from '@/components/sake/line-block'
import { RomajiDisclosure } from '@/components/sake/romaji-disclosure'
import { SakenowaAttribution } from '@/components/sake/sakenowa-attribution'
import type { FlavorChart } from '@/lib/schemas/flavor-chart'
import { lookupFlavorChart } from '@/lib/sakenowa/lookup'
import { entriesForExpression, resolveViewerJournal } from '@/lib/taste/viewer-journal'

/**
 * §9a Bottling page, for a bottling the visitor added themselves (design v1.6
 * and v1.6.1, screenshot 57; ADR-0025). One template in §9's order, sections
 * dropping out by what is known.
 *
 * **Private.** A bottling is found in the visitor's own store and nowhere
 * else, so anyone else — or anyone who cannot keep a journal (ADR-0020) —
 * gets a 404. The page never says whether an id exists for someone else.
 *
 * **Two kinds, one template.** A bottling of a sake the catalogue has ("Add
 * your bottling", §9) links back to that sake and ends in the line block. A
 * bottling with no sake ("Keep it anyway", §5a; "Add it yourself", §8) has
 * nothing of the catalogue's on it: no line link, no line block, no chart, no
 * Sakenowa credit above the fold or at the end of the screen (rule 15).
 *
 * **What this port leaves out, and why:**
 *
 * - **"The sake" spec grid.** §9a draws six fixed rows reading "Not
 *   published" until §10's "About the sake" fills them. Nothing can fill them
 *   yet, so six empty rows would say nothing about this bottling — the same
 *   reasoning that keeps §9's sourceless sections behind `FEATURES`.
 * - **The cellar control and the wishlist.** A cellar row is keyed by sake
 *   today; "one row per thing a bottle was logged against" (v1.6.1) is
 *   CellarBottle v2, its own slice. Wishlist is not built anywhere.
 * - **Rename and delete.** Not drawn. Tracked as a question for the designers.
 */
interface PageProps {
  params: Promise<{ locale: string; id: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

// Private to its author: never indexed, and the title names nothing.
export const metadata: Metadata = { robots: { index: false, follow: false } }

/**
 * The line's chart, or `null` when it has none — or when the mirror cannot be
 * reached. The bottling is the visitor's own record and renders without the
 * catalogue; a lookup failure must not take their page down with it.
 */
async function lookupFlavorChartSafe(brandId: number): Promise<FlavorChart | null> {
  try {
    return await lookupFlavorChart(brandId)
  } catch {
    return null
  }
}

export default async function BottlingPage({ params, searchParams }: PageProps) {
  const { locale, id } = await params
  // "Keep it anyway" and "Add it yourself" land here with `?rate=1`: the
  // design sends them to §5's card to rate, and this page's panel is that card's.
  const rateNow = (await searchParams).rate === '1'
  setRequestLocale(locale)

  const viewer = await resolveViewerJournal(await cookies())
  const bottling = viewer.canLog ? viewer.expressions.find((e) => e.id === id) : undefined
  if (!bottling) notFound()
  const { brandId, line } = bottling

  const [chart, t] = await Promise.all([
    brandId === null ? null : lookupFlavorChartSafe(brandId),
    getTranslations('bottling'),
  ])

  const tastings = entriesForExpression(viewer.entries, bottling.id)
  const lastTasting = tastings[0]
  const lineName = line ? (line.nameRomaji ?? line.nameKanji) : null
  const lineKanji = line && line.nameRomaji !== null ? line.nameKanji : null
  // The visitor's other bottlings of the same sake (§9a.7: "Own bottlings of
  // the same line appear here too, for their author"). Without a sake there
  // is no line for others to share.
  const others =
    brandId === null
      ? []
      : viewer.expressions.filter((e) => e.brandId === brandId && e.id !== bottling.id)

  return (
    <main
      className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-5 py-5"
      data-testid="bottling-page"
      // Rule 15: with no sake, nothing on this screen is the catalogue's.
      {...(brandId === null ? { 'data-no-catalogue-data': '' } : {})}
    >
      <ScreenBar title={bottling.name} />

      {/* -- §9a.2 Identity ------------------------------------------------ */}
      <section className="flex flex-col gap-3" data-testid="bottling-identity">
        <div className="flex flex-col gap-1">
          <h1 className="text-bottle-name font-medium text-ink" data-testid="bottling-name">
            {bottling.name}
          </h1>
          {brandId !== null && lineName !== null ? (
            <>
              <Link
                href={{ pathname: '/sake/[brandId]', params: { brandId: String(brandId) } }}
                className="inline-flex min-h-7 items-center gap-1 self-start rounded-sm text-subtle text-ginshu-700 hover:text-ginshu-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ginshu-600"
                data-testid="bottling-line-link"
              >
                <span>
                  {t.rich('bottlingOf', {
                    line: lineName,
                    kanji: () =>
                      lineKanji ? (
                        <span className="text-ash-600" lang="ja">
                          {lineKanji}
                        </span>
                      ) : null,
                  })}
                </span>
                <CaretRight size={13} aria-hidden="true" />
              </Link>
              {/* The line's Latin name is a machine transliteration, as on the
                  sake's own page; the bottling's name is the visitor's own words. */}
              {lineKanji !== null && <RomajiDisclosure id={`bottling-${bottling.id}-romaji`} />}
            </>
          ) : (
            // §9a, own bottling: "place = the brewery typed, else 'Added by you'".
            <p className="text-body text-ash-600" data-testid="bottling-place">
              {bottling.brewery ?? t('addedByYou')}
            </p>
          )}
          <p className="mt-1">
            <span
              className="inline-flex min-h-7 items-center rounded-full border border-ash-400 px-2.5 text-meta text-ash-700"
              data-testid="bottling-own-tag"
            >
              {t('ownEntry')}
            </span>
          </p>
          <p className="text-subtle text-ash-700" data-testid="bottling-own-line">
            {lineName !== null ? t('ownOfLine', { line: lineName }) : t('ownNoLine')}
          </p>
        </div>
        {/* §9a gives an own bottling no credit line. One that belongs to a sake
            shows that sake's name, which is Sakenowa's, so the above-the-fold
            credit stays (CLAUDE.md, Sakenowa attribution). With no sake there
            is nothing of Sakenowa's to credit. */}
        {brandId !== null && <SakenowaAttribution placement="identity" />}
      </section>

      {/* -- §9a.3 Action row: §9's, without "Similar" ---------------------- */}
      <BottleRateRow
        brandId={brandId}
        expressionId={bottling.id}
        sakeName={bottling.name}
        chart={chart}
        history={
          lastTasting && lastTasting.event.kind === 'rating'
            ? { kind: 'last', triedAt: lastTasting.triedAt, rating: lastTasting.event.rating }
            : { kind: 'first' }
        }
        similar={null}
        cellar={null}
        initiallyOpen={rateNow}
      />

      {/* -- §9a.4 You and this bottling ------------------------------------ */}
      <BottleHistory
        brandId={brandId}
        chart={chart}
        entries={tastings}
        locale={locale}
        subject="bottling"
      />

      {/* -- §9a.7 Other bottlings in this line ----------------------------- */}
      {others.length > 0 && (
        <BottleSection
          label={t('otherBottlings')}
          caption={t('more', { n: others.length })}
          testId="bottling-others"
        >
          {/* Rule 7's horizontal row: it scrolls sideways, the page does not. */}
          <ul className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1" role="list">
            {others.map((other) => (
              <li key={other.id} className="shrink-0">
                <Link
                  href={{ pathname: '/bottling/[id]', params: { id: other.id } }}
                  className="flex min-h-14 max-w-64 flex-col justify-center rounded-lg bg-surface px-3 py-2 shadow-yw-sm transition-colors hover:bg-ash-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ginshu-600"
                >
                  <span className="truncate text-subtle font-medium text-ink">{other.name}</span>
                  <span className="text-section-label text-ash-700">{t('ownEntry')}</span>
                </Link>
              </li>
            ))}
          </ul>
        </BottleSection>
      )}

      {/* -- §9a.8 About the line ------------------------------------------- */}
      {/* No sake, no line block — so no chart and no "Similar" (§9a). */}
      {brandId !== null && lineName !== null && (
        <LineBlock brandId={brandId} lineName={lineName} lineKanji={lineKanji} chart={chart} />
      )}
    </main>
  )
}
