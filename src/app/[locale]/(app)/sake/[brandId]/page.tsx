import { cache } from 'react'
import { cookies } from 'next/headers'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { Link } from '@/i18n/navigation'
import { isPlaceholderBrewery } from '@/lib/schemas/brewery'
import {
  lookupBrand,
  lookupBreweryByBrand,
  lookupFlavorChart,
} from '@/lib/sakenowa/lookup'
import { getPrefectureNames } from '@/lib/sakenowa/prefecture'
import { BottleHistory } from '@/components/sake/bottle-history'
import { BottleRateRow } from '@/components/sake/bottle-rate-row'
import { BottleSection, NotPublished } from '@/components/sake/bottle-section'
import { BottleSlot } from '@/components/sake/bottle-slot'
import { BreweryOtherSakes, listSiblingBrandsSafe } from '@/components/sake/brewery-other-sakes'
import { FlavorChartView } from '@/components/sake/flavor-chart'
import { RomajiDisclosure } from '@/components/sake/romaji-disclosure'
import { ScanReturnHint } from '@/components/scan/scan-return-hint'
import {
  SakenowaAttribution,
  requiresSakenowaAttribution,
} from '@/components/sake/sakenowa-attribution'
import { FEATURES } from '@/lib/features'
import { hasArrivedViaScan } from '@/lib/scan/arrived-via-scan'
import { entriesForBrand, resolveViewerJournal } from '@/lib/taste/viewer-journal'

/**
 * §9 Bottle page — one screen per sake. Reference screenshots 16 and 17.
 *
 * §9 orders the page "personal to general": who you are to this bottle first,
 * then how to serve it, then what it is, then what other people think, then
 * where to buy it. The order is the spec's.
 *
 * **Which empty sections show.** Rule 4, "Missing data is stated, not hidden",
 * is about data a bottle might lack: about half the catalogue has no flavor
 * chart (ADR-0016), so a chartless bottle says so, and that tells the visitor
 * something true about this sake. A section that no bottle can fill is a
 * different case. The Sakenowa mirror carries names, brewery, prefecture and
 * the six axes, and nothing else: no brewing specs, no serving temperatures,
 * no pairings, no notes, no shops. An empty sentence there reads the same on
 * all ~3,000 pages, says nothing about the sake, and only advertises features
 * we have not built. Those sections sit behind `FEATURES`
 * (`src/lib/features.ts`), each with its issue, and return with their data.
 *
 * The same goes for caveats. An info button explains something on screen; over
 * an empty section there is nothing for it to explain.
 *
 * **What this port deliberately leaves out, and why:**
 *
 * - **§9's own header** (back · sake name · wishlist and cellar buttons). The
 *   back arrow lands here — rule 11, via `<ShellBackLink />` in the shell —
 *   but the shell header still shows the wordmark rather than a per-screen
 *   title, and wishlist/cellar are Phase 2 domain concepts with no table
 *   behind them (ADR-0011 gates the migration). An icon that saves nothing is
 *   the dead affordance #162 forbids.
 * - **§9.2's "Rate a new tasting" and §9.3 "You and this sake" for everyone
 *   but a maintainer.** Both read or write the visitor's journal, which is
 *   maintainer-only until the local-first rewrite (ADR-0020, gated on
 *   ADR-0011). A maintainer gets both; anyone else gets neither, because
 *   "Not tasted yet." with no way to change it is a dead end dressed as an
 *   empty state. For them "Similar" is the action row.
 * - **"Rate a new tasting" opens §5's panel in place** rather than a second
 *   result-card screen — see `<BottleRateRow />`.
 * - **§9.4 Serve it, §9.5 The sake, §9.7 Goes with, §9.8 What others
 *   noticed, §9.10 Where to find it.** No source for any bottle; behind
 *   `FEATURES` until #340, #339, #336, #337 and #338.
 *
 * Tracked on #300. What this port DOES add beyond styling is §9.9's row of the
 * brewery's other sakes, which closes the dead end in #325.
 */
interface PageProps {
  params: Promise<{ locale: string; brandId: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

// `cache()` dedupes lookups across the same request — `generateMetadata`
// and the page component both fetch the brand; without this we'd hit
// Postgres twice.
const lookupBrandCached = cache(lookupBrand)
const lookupBreweryCached = cache(lookupBreweryByBrand)
const lookupFlavorChartCached = cache(lookupFlavorChart)

// Reject "1abc" (which `Number.parseInt('1abc', 10)` would silently coerce
// to 1) and similar garbage. Strict numeric matching only.
function parseBrandIdParam(value: string): number | null {
  if (!/^\d+$/.test(value)) return null
  const n = Number(value)
  return Number.isInteger(n) && n > 0 ? n : null
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { brandId: brandIdParam } = await params
  const brandId = parseBrandIdParam(brandIdParam)
  if (brandId === null) return {}
  const brand = await lookupBrandCached(brandId)
  if (!brand) return {}
  const title =
    brand.nameKanji === brand.name
      ? `${brand.nameKanji} | Yawaragi`
      : `${brand.nameKanji} (${brand.name}) | Yawaragi`
  return { title }
}

export default async function SakeBrandPage({ params, searchParams }: PageProps) {
  const { locale, brandId: brandIdParam } = await params
  const arrivedViaScan = hasArrivedViaScan(await searchParams)
  setRequestLocale(locale)

  const brandId = parseBrandIdParam(brandIdParam)
  if (brandId === null) {
    notFound()
  }

  const [brand, brewery, flavorChart, siblings, viewer] = await Promise.all([
    lookupBrandCached(brandId),
    lookupBreweryCached(brandId),
    lookupFlavorChartCached(brandId),
    listSiblingBrandsSafe(brandId),
    cookies().then(resolveViewerJournal),
  ])
  if (!brand) {
    notFound()
  }

  const t = await getTranslations('sake.brand')
  const tScan = await getTranslations('scan.form')

  // §9.3: this sake's tastings, newest first — and the meta §5's panel shows
  // before the first tap ("Last logged 19 Sep · 4.5" / "First time for you").
  const tastings = viewer.canLog ? entriesForBrand(viewer.entries, brandId) : []
  const lastTasting = tastings[0]

  // §9.1 draws the Latin name large with the Japanese beneath it — "Kidoizumi
  // AFS" over "木戸泉 AFS". That is §15's default name display (Romaji + kanji)
  // for an EN visitor, and the setting that would flip it is not built. Where
  // the ingest pipeline has not produced a transliteration (#121) the kanji is
  // the only name there is, so it takes the heading instead of leaving one
  // blank.
  const romaji = brand.nameRomaji
  // Hide the brewery entirely for Sakenowa placeholder rows (~48 in the
  // dataset). "Brewery:" with no name reads worse than no section.
  const showBrewery = brewery !== null && !isPlaceholderBrewery(brewery)
  // Prefecture is editorially mapped (manual_curation per ADR-0005) because
  // Sakenowa's /areas endpoint publishes Japanese names only.
  const prefecture = showBrewery ? getPrefectureNames(brewery.areaId) : null
  const breweryRomaji = showBrewery ? brewery.nameRomaji : null
  const showBrewerySection = showBrewery && siblings.length > 0
  const showRomajiDisclosure =
    romaji !== null ||
    breweryRomaji !== null ||
    (showBrewerySection && siblings.some((sibling) => sibling.nameRomaji !== null))

  // §9.1's "Little published" outline tag. The design attaches it to a bottle
  // whose data is thin; the flavour chart is the bulk of what the mirror
  // carries, so its absence is the honest proxy — and ADR-0016 records that
  // roughly half the catalogue has none. The tag is a statement about our
  // knowledge, not about the sake.
  const littlePublished = flavorChart === null

  // ADR-0014: render Sakenowa attribution only when at least one rendered
  // record on the page is Sakenowa-sourced.
  const renderedSources = new Set<string>([brand.source])
  if (showBrewery) renderedSources.add(brewery.source)
  if (flavorChart) renderedSources.add(flavorChart.source)
  const showSakenowaAttribution = requiresSakenowaAttribution(renderedSources)

  return (
    <main
      className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-5 py-5"
      data-testid="sake-brand-page"
    >
      {showSakenowaAttribution && <SakenowaAttribution placement="above-fold" />}
      {/*
        "Not the bottle you scanned? Scan again" — only when the link that
        brought the visitor was a scan result's (#109). Decided here, on the
        server, so it is in the first paint and nothing jumps.
      */}
      {arrivedViaScan && <ScanReturnHint />}

      {/* -- §9.1 Identity ------------------------------------------------ */}
      <section className="flex items-start gap-4" data-testid="bottle-identity">
        <BottleSlot
          showScannedPhoto={arrivedViaScan}
          placeholderLabel={t('bottleSlotLabel')}
          photoAlt={tScan('photoAlt')}
        />
        <div className="flex min-w-0 flex-col gap-1">
          {romaji !== null ? (
            <>
              {/*
                Both Latin names on this block — the sake's and the brewery's —
                are LLM transliterations of Sakenowa-sourced records
                (`src/lib/sakenowa/romaji.ts`), so CLAUDE.md requires that
                neither appears without a provenance affordance. The affordance
                is ONE §16 disclosure under the block rather than a
                `<ProvenanceBadge />` on each.
                
                Why: at 390px the identity column is ~270px wide and the name
                is 25px type, so a chip beside it never fits — it wraps to its
                own line, every time, and the page's most important element
                arrives as name / chip / kana / brewery / chip. §16 is the
                design's pattern for exactly this (CLAUDE.md: "reuse it for
                every inferred claim"), and the compliance property is the same
                one `<HeuristicDisclaimer />`'s density pass relies on: the
                caveat text stays in the DOM, wired to the info button by
                `aria-describedby`, so a screen-reader user reaches the full
                explanation with no interaction.
                
                `data-romaji-field` marks the fields themselves, which is what
                the e2e uses to check that no badge has drifted onto a
                canonical Sakenowa value.
              */}
              <h1
                className="text-bottle-name font-medium text-ink"
                lang="en"
                data-testid="brand-name-romaji"
                data-romaji-field=""
              >
                {romaji}
              </h1>
              <p className="text-md-alt text-ash-700" lang="ja" data-testid="brand-name-kanji">
                {brand.nameKanji}
              </p>
            </>
          ) : (
            <h1
              className="text-bottle-name font-medium text-ink"
              lang="ja"
              data-testid="brand-name-kanji"
            >
              {brand.nameKanji}
            </h1>
          )}
          {showBrewery && (
            <p className="text-body text-ash-600" data-testid="bottle-brewery-line">
              {breweryRomaji !== null ? (
                <span lang="en" data-testid="brewery-name-romaji" data-romaji-field="">
                  {breweryRomaji}
                </span>
              ) : (
                <span lang="ja">{brewery.nameKanji}</span>
              )}
              {prefecture && (
                <>
                  <span className="mx-1.5 text-ash-500" aria-hidden="true">
                    ·
                  </span>
                  <span lang="en" data-testid="prefecture-name-en">
                    {prefecture.nameEn}
                  </span>
                </>
              )}
            </p>
          )}
          {/*
            The page's ONE transliteration caveat. It covers every Latin name
            on the page — this bottle's, its brewery's, and the other sakes'
            chips in §9.9 — so it shows when any of them does. Two copies of
            the same sentence on one screen read as noise (maintainer review).
          */}
          {showRomajiDisclosure && (
            <RomajiDisclosure id={`brand-${brandId}-identity-romaji`} />
          )}
          {littlePublished && (
            <p className="mt-1">
              {/*
                Rule 9, "one accent tag per row": this is the app's own claim
                about its knowledge, so it takes the accent outline. Facts
                about the sake (Junmai, Kimoto) would be neutral — none of them
                are in the mirror yet.
              */}
              <span
                className="inline-flex min-h-7 items-center rounded-full border border-ginshu-400 px-2.5 text-meta text-ginshu-700"
                data-testid="bottle-little-published"
              >
                {t('littlePublished')}
              </span>
            </p>
          )}
        </div>
      </section>

      {/* -- §9.2 Action row ---------------------------------------------- */}
      {/*
        "Similar" ranks by distance over the six flavour axes, so a bottle with
        no chart has nothing to be similar BY — §6 would open on its "no chart
        yet" empty state. The page already knows, so it does not offer the
        tap. For a visitor who cannot keep a journal that can leave the row
        empty, and an empty row is not rendered.

        With "Rate a new tasting" beside it, "Similar" steps down to §9's
        secondary style: one accent button per row (rule 9's spirit), and the
        accent belongs to the personal action.
      */}
      {viewer.canLog ? (
        <BottleRateRow
          brandId={brandId}
          chart={flavorChart}
          history={
            lastTasting && lastTasting.event.kind === 'rating'
              ? { kind: 'last', triedAt: lastTasting.triedAt, rating: lastTasting.event.rating }
              : { kind: 'first' }
          }
          similar={
            flavorChart && (
              <Link
                href={{ pathname: '/sake/[brandId]/similar', params: { brandId: String(brandId) } }}
                className="flex min-h-11 items-center justify-center rounded-xl border border-ash-300 px-4 text-body font-medium text-ink transition-colors hover:bg-ash-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ginshu-600"
                data-testid="similar-sakes-link"
              >
                {t('similarAction')}
              </Link>
            )
          }
        />
      ) : (
        flavorChart && (
          <div className="flex gap-2" data-testid="bottle-actions">
            <Link
              href={{ pathname: '/sake/[brandId]/similar', params: { brandId: String(brandId) } }}
              className="flex min-h-11 flex-1 items-center justify-center rounded-xl border border-ginshu-400 px-4 text-card-heading font-medium text-ginshu-700 transition-colors hover:bg-ginshu-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ginshu-600"
              data-testid="similar-sakes-link"
            >
              {t('similarAction')}
            </Link>
          </div>
        )
      )}

      {/* -- §9.3 You and this sake ---------------------------------------- */}
      {viewer.canLog && <BottleHistory entries={tastings} locale={locale} />}

      {/* -- §9.4 Serve it ------------------------------------------------ */}
      {FEATURES.bottleServing && (
        <BottleSection label={t('serveLabel')} testId="bottle-serve">
          <p className="text-body text-ash-600">{t('serveEmpty')}</p>
        </BottleSection>
      )}

      {/* -- §9.5 The sake ------------------------------------------------ */}
      {FEATURES.bottleSpecs && (
        <BottleSection label={t('specsLabel')} testId="bottle-specs">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3">
            {(['specRice', 'specPolishing', 'specYeast', 'specSmv'] as const).map((key) => (
              <div key={key} className="flex flex-col gap-0.5">
                <dt className="text-section-label uppercase text-ash-600">{t(key)}</dt>
                <dd className="text-body">
                  <NotPublished label={t('notPublished')} />
                </dd>
              </div>
            ))}
          </dl>
        </BottleSection>
      )}

      {/* -- §9.6 Flavour chart (§17) ------------------------------------- */}
      {flavorChart ? (
        <FlavorChartView chart={flavorChart} />
      ) : (
        <BottleSection label={t('flavorChartLabel')} testId="bottle-flavor-chart-empty">
          {/*
            Rule 4 proper: about half the catalogue has a chart, so its
            absence is a fact about this bottle, and the page states it.

            Only the first sentence of §17's EU string ("…Yawaragi users build
            one with four ratings — you can join in Account → Privacy"). There
            is no such setting in Account, and rating is maintainer-only until
            ADR-0020's rewrite, so the rest sent visitors to a dead end. The
            deviation is logged for the designers on #308; restore the full
            string when the sharing setting exists.

            No info button. The terms sheet explains the six axis labels, and
            with no chart there are no labels on screen to explain. ADR-0022
            makes the disclosure load-bearing wherever the axes render, which
            is `<FlavorChartView />`, and it is still there.
          */}
          <p className="text-body text-ash-600">{t('flavorChartEmpty')}</p>
        </BottleSection>
      )}

      {/* -- §9.7 Goes with ----------------------------------------------- */}
      {FEATURES.bottlePairings && (
        <BottleSection label={t('pairingsLabel')} testId="bottle-pairings">
          <p className="text-body text-ash-600">{t('pairingsEmpty')}</p>
        </BottleSection>
      )}

      {/* -- §9.8 What others noticed ------------------------------------- */}
      {FEATURES.bottleCommunityNotes && (
        <BottleSection label={t('communityLabel')} testId="bottle-community">
          <p className="text-body text-ash-600">{t('communityEmpty')}</p>
        </BottleSection>
      )}

      {/* -- §9.9 The brewery --------------------------------------------- */}
      {/*
        §9.9 is "story plus a row of its other sakes. Hidden without data." We
        have no story, so the row is the section: a brewery with no other
        brand in the mirror gets no section, rather than one that repeats the
        name and prefecture §9.1 already shows.

        The name reads like §9.1's: romaji large, kanji under it, so a visitor
        reading down the page does not meet two conventions. The romaji here
        is covered by the page's one transliteration caveat, in §9.1.
      */}
      {showBrewerySection && (
        <BottleSection label={t('theBreweryLabel')} testId="brand-brewery">
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-0.5">
              {breweryRomaji !== null ? (
                <>
                  <p
                    className="text-card-heading font-medium text-ink"
                    lang="en"
                    data-testid="brewery-section-name-romaji"
                    data-romaji-field=""
                  >
                    {breweryRomaji}
                  </p>
                  <p className="text-meta text-ash-600">
                    <span lang="ja" data-testid="brewery-name-kanji">
                      {brewery.nameKanji}
                    </span>
                    {prefecture && (
                      <>
                        <span className="mx-1.5 text-ash-500" aria-hidden="true">
                          ·
                        </span>
                        <span lang="ja" data-testid="prefecture-name-ja">
                          {prefecture.nameJa}
                        </span>
                      </>
                    )}
                  </p>
                </>
              ) : (
                <>
                  <p
                    className="text-card-heading font-medium text-ink"
                    lang="ja"
                    data-testid="brewery-name-kanji"
                  >
                    {brewery.nameKanji}
                  </p>
                  {prefecture && (
                    <p className="text-meta text-ash-600" lang="ja" data-testid="prefecture-name-ja">
                      {prefecture.nameJa}
                    </p>
                  )}
                </>
              )}
            </div>
            <BreweryOtherSakes siblings={siblings} intro={t('otherSakesIntro')} />
          </div>
        </BottleSection>
      )}

      {/* -- §9.10 Where to find it --------------------------------------- */}
      {FEATURES.bottleShops && (
        <BottleSection label={t('shopsLabel')} testId="bottle-shops">
          <p className="text-body text-ash-600">{t('shopsEmpty')}</p>
        </BottleSection>
      )}
    </main>
  )
}
