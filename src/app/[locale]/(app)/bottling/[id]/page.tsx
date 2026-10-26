import { cookies } from 'next/headers'
import { notFound } from 'next/navigation'
import { GoesWith } from '@/components/sake/goes-with'
import { resolvePairing, stylesFromWords } from '@/lib/pairing/resolve-pairing'
import { catalogueAxisStats } from '@/lib/taste/catalogue-mean'
import type { Metadata } from 'next'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { CaretRight } from '@phosphor-icons/react/dist/ssr'
import { Link } from '@/i18n/navigation'
import { CellarButton } from '@/components/collection/cellar-button'
import { ScreenBar } from '@/components/layout/screen-header'
import { BottleHistory } from '@/components/sake/bottle-history'
import { BottlingManage } from '@/components/sake/bottling-manage'
import { BottleRateRow } from '@/components/sake/bottle-rate-row'
import { BottleSection } from '@/components/sake/bottle-section'
import { LineBlock } from '@/components/sake/line-block'
import { ReadingByAiLine } from '@/components/sake/reading-by-ai-line'
import { RomajiDisclosure } from '@/components/sake/romaji-disclosure'
import { SakenowaAttribution } from '@/components/sake/sakenowa-attribution'
import type { FlavorChart } from '@/lib/schemas/flavor-chart'
import { lookupFlavorChart } from '@/lib/sakenowa/catalogue-reads'
import { bottlingHoldings } from '@/lib/collection/bottling-changes'
import { bottlesOf } from '@/lib/collection/cellar'
import { entriesForExpression, resolveViewerJournal } from '@/lib/taste/viewer-journal'
import { lastTastingOf } from '@/lib/taste/last-tasting'
import { bottlingPageModel } from '@/lib/sake-page/bottling-page-model'

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
 * - **The wishlist.** Not built anywhere.
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
  const bottling = viewer.canView ? viewer.expressions.find((e) => e.id === id) : undefined
  if (!bottling) notFound()
  const { brandId } = bottling

  const [chart, t, axisStats] = await Promise.all([
    brandId === null ? null : lookupFlavorChartSafe(brandId),
    getTranslations('bottling'),
    brandId === null ? null : catalogueAxisStats(),
  ])
  // The bottling's own grade and styles first; its line's chart only when
  // they say nothing a pairing can use (#336).
  const pairing = resolvePairing({
    styles: stylesFromWords(bottling.styles ?? []),
    grade: bottling.grade,
    chart,
    stats: axisStats,
  })

  const tastings = entriesForExpression(viewer.entries, bottling.id)
  // What this page shows — the line, the tags, the other bottlings, the
  // Sakenowa credit — is decided in `bottlingPageModel`, where it is
  // unit-tested; this component only renders it.
  const model = bottlingPageModel({
    bottling,
    expressions: viewer.expressions,
    labels: {
      polishedTo: (n) => t('polishedTo', { n }),
      koji: (koji) => t(`koji.${koji}`),
    },
  })
  const { line, others } = model

  return (
    <main
      className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-5 py-5"
      data-testid="bottling-page"
      // Rule 15: with no sake, nothing on this screen is the catalogue's.
      {...(model.noCatalogueData ? { 'data-no-catalogue-data': '' } : {})}
    >
      <ScreenBar title={bottling.name} />

      {/* -- §9a.2 Identity ------------------------------------------------ */}
      <section className="flex flex-col gap-3" data-testid="bottling-identity">
        <div className="flex flex-col gap-1">
          <h1 className="text-bottle-name font-medium text-ink" data-testid="bottling-name">
            {bottling.name}
          </h1>
          {line ? (
            <>
              <Link
                href={{ pathname: '/sake/[brandId]', params: { brandId: String(line.brandId) } }}
                className="inline-flex min-h-7 items-center gap-1 self-start rounded-sm text-subtle text-ginshu-700 hover:text-ginshu-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ginshu-600"
                data-testid="bottling-line-link"
              >
                <span>
                  {t.rich('bottlingOf', {
                    line: line.name,
                    kanji: () =>
                      line.kanji ? (
                        <span className="text-ash-600" lang="ja">
                          {line.kanji}
                        </span>
                      ) : null,
                  })}
                </span>
                <CaretRight size={13} aria-hidden="true" />
              </Link>
              {/* The line's Latin name is a machine transliteration, as on the
                  sake's own page; the bottling's name is the visitor's own words. */}
              {line.kanji !== null && <RomajiDisclosure id={`bottling-${bottling.id}-romaji`} />}
            </>
          ) : (
            // §9a, own bottling: "place = the brewery typed, else 'Added by you'".
            <p className="text-body text-ash-600" data-testid="bottling-place">
              {bottling.brewery ?? t('addedByYou')}
            </p>
          )}
          <p className="mt-1 flex flex-wrap gap-1.5" data-testid="bottling-tags">
            {/* Design v1.7 D5: grade and style tags come from the bottling's
                own fields, the visitor's words — not catalogue data. */}
            {model.tags.map((tag) => (
              <span
                key={tag}
                className="inline-flex min-h-7 items-center rounded-full border border-ash-300 px-2.5 text-meta text-ash-700"
              >
                {tag}
              </span>
            ))}
            <span
              className="inline-flex min-h-7 items-center rounded-full border border-ash-400 px-2.5 text-meta text-ash-700"
              data-testid="bottling-own-tag"
            >
              {t('ownEntry')}
            </span>
          </p>
          <p className="text-subtle text-ash-700" data-testid="bottling-own-line">
            {line ? t('ownOfLine', { line: line.name }) : t('ownNoLine')}
          </p>
          {model.showReadingByAi && (
            <ReadingByAiLine
              label={t('readingByAi.label')}
              title={t('readingByAi.title')}
              body={t('readingByAi.body')}
              closeLabel={t('readingByAi.close')}
            />
          )}
        </div>
        {/* Only for a bottling of a sake, whose name is Sakenowa's (see
            `BottlingPageModel.showSakenowaAttribution`). */}
        {model.showSakenowaAttribution && <SakenowaAttribution placement="identity" />}
      </section>

      {/* -- §9a.3 Action row: §9's, without "Similar" ---------------------- */}
      {/* The sample collection is read-only: no rating, no cellar, no rename. */}
      {viewer.canLog && (
        <BottleRateRow
          brandId={brandId}
          expressionId={bottling.id}
          sakeName={bottling.name}
          chart={chart}
          history={lastTastingOf(tastings)}
          similar={null}
          // §9a: the count is this bottling's own row.
          cellar={
            <CellarButton
              target={{ expressionId: bottling.id }}
              name={bottling.name}
              initialCount={bottlesOf(viewer.cellar, { expressionId: bottling.id })}
            />
          }
          initiallyOpen={rateNow}
        />
      )}

      {/* -- §9a.4 You and this bottling ------------------------------------ */}
      <BottleHistory
        brandId={brandId}
        chart={chart}
        entries={tastings}
        locale={locale}
        subject="bottling"
        readOnly={!viewer.canLog}
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
      {line && (
        <LineBlock brandId={line.brandId} lineName={line.name} lineKanji={line.kanji} chart={chart} />
      )}

      {/* -- Goes with: §9.7's section, after the line block (v1.8 Q2) ------ */}
      {pairing && <GoesWith pairing={pairing} id={`bottling-${bottling.id}`} />}

      {/* -- "This bottling" (v1.6.2): rename, delete — the last section ---- */}
      {viewer.canLog && (
        <BottlingManage
          expressionId={bottling.id}
          name={bottling.name}
          brewery={bottling.brewery}
          details={{ grade: bottling.grade, styles: bottling.styles, polishingPct: bottling.polishingPct, koji: bottling.koji }}
          sake={line ? { brandId: line.brandId, name: line.name } : null}
          {...bottlingHoldings(bottling, { entries: viewer.entries, cellar: viewer.cellar })}
        />
      )}
    </main>
  )
}
