import { cache } from 'react'
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
import { BottleSection, NotPublished } from '@/components/sake/bottle-section'
import { BottleSlot } from '@/components/sake/bottle-slot'
import { BreweryOtherSakes } from '@/components/sake/brewery-other-sakes'
import { FlavorChartView } from '@/components/sake/flavor-chart'
import { FlavorTermsDisclosure } from '@/components/sake/flavor-terms-disclosure'
import { RomajiDisclosure } from '@/components/sake/romaji-disclosure'
import { ScanReturnHint } from '@/components/scan/scan-return-hint'
import {
  SakenowaAttribution,
  requiresSakenowaAttribution,
} from '@/components/sake/sakenowa-attribution'
import { FEATURES } from '@/lib/features'
import { hasArrivedViaScan } from '@/lib/scan/arrived-via-scan'

/**
 * §9 Bottle page — one screen per sake. Reference screenshots 16 and 17.
 *
 * §9 orders the page "personal to general": who you are to this bottle first,
 * then how to serve it, then what it is, then what other people think, then
 * where to buy it. The order is the spec's, and it is kept even where a
 * section has nothing to say — rule 4, "Missing data is stated, not hidden".
 * Screenshot 17 is that page drawn deliberately: five of its sections are an
 * empty-state sentence, and that is the design, not a shortfall.
 *
 * It matters because it is also OUR data situation. The Sakenowa mirror
 * carries names, brewery, prefecture and the six axes — no brewing specs, no
 * serving temperatures, no pairings, no shops. A visitor reading "Not
 * published" learns something true about the catalogue; a visitor reading a
 * page with those sections quietly removed learns nothing at all.
 *
 * **What this port deliberately leaves out, and why:**
 *
 * - **§9's own header** (back · sake name · wishlist and cellar buttons). The
 *   back arrow lands here — rule 11, via `<ShellBackLink />` in the shell —
 *   but the shell header still shows the wordmark rather than a per-screen
 *   title, and wishlist/cellar are Phase 2 domain concepts with no table
 *   behind them (ADR-0011 gates the migration). An icon that saves nothing is
 *   the dead affordance #162 forbids.
 * - **§9.3 "You and this sake".** It reads the visitor's journal, which is
 *   maintainer-only until the local-first rewrite (ADR-0020, gated on
 *   ADR-0011). Rendering "Not tasted yet." to everyone, with no way to change
 *   it, would be a dead end dressed as an empty state.
 * - **§9.2's primary "Rate a new tasting".** Same gate: the star IS the save
 *   (rule 1), and the star row is Phase 2 — #307 shipped §5's surface without
 *   it for the same reason. "Similar" is the action that is real today.
 * - **§9.4's six-temperature row.** Screenshot 17 shows the row absent and
 *   only the sentence when nobody has said — which is every bottle we have.
 *   The row arrives with the data that fills it.
 * - **§9.7 Goes with, §9.8 What others noticed, §9.10 Where to find it.**
 *   Rule 4 ("missing data is stated, not hidden") is about data a bottle
 *   might lack. Nothing at all stands behind these three yet, so their empty
 *   sentence said nothing about the sake on any page — it only advertised
 *   features we have not built. They sit behind `FEATURES` until they are
 *   real (#336, #337, #338).
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

  const [brand, brewery, flavorChart] = await Promise.all([
    lookupBrandCached(brandId),
    lookupBreweryCached(brandId),
    lookupFlavorChartCached(brandId),
  ])
  if (!brand) {
    notFound()
  }

  const t = await getTranslations('sake.brand')
  const tScan = await getTranslations('scan.form')

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
          {(romaji !== null || breweryRomaji !== null) && (
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
        tap. With "Rate a new tasting" still Phase 2, that leaves the row empty,
        and an empty row is not rendered.
      */}
      {flavorChart && (
        <div className="flex gap-2" data-testid="bottle-actions">
          <Link
            href={{ pathname: '/sake/[brandId]/similar', params: { brandId: String(brandId) } }}
            className="flex min-h-11 flex-1 items-center justify-center rounded-xl border border-ginshu-400 px-4 text-card-heading font-medium text-ginshu-700 transition-colors hover:bg-ginshu-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ginshu-600"
            data-testid="similar-sakes-link"
          >
            {t('similarAction')}
          </Link>
        </div>
      )}

      {/* -- §9.4 Serve it ------------------------------------------------ */}
      <BottleSection label={t('serveLabel')} testId="bottle-serve">
        <p className="text-body text-ash-600">{t('serveEmpty')}</p>
      </BottleSection>

      {/* -- §9.5 The sake ------------------------------------------------ */}
      <BottleSection label={t('specsLabel')} testId="bottle-specs">
        {/*
          Four fields, not §9's eight. Screenshot 17 — the thin bottle, which
          is every bottle we have — draws Rice, Polishing, Yeast and SMV; the
          other four appear on 16, where there is data to put in them. Eight
          rows of "Not published" would state the same fact four times over.
        */}
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

      {/* -- §9.6 Flavour chart (§17) ------------------------------------- */}
      {flavorChart ? (
        <FlavorChartView chart={flavorChart} />
      ) : (
        <BottleSection label={t('flavorChartLabel')} testId="bottle-flavor-chart-empty">
          {/*
            §17's "no chart yet" copy for a market where sharing is off, which
            is the EU default (Open decision 2). The info button stays: the
            sheet explains what the six axes WOULD be, which is exactly what a
            visitor looking at an empty chart section is missing. It is the
            same disclosure ADR-0022 makes load-bearing when the chart is
            there, so it cannot quietly disappear with the data.
          */}
          <div className="flex flex-col gap-2">
            <FlavorTermsDisclosure instanceId={`brand-${brandId}-empty`} />
            <p className="text-body text-ash-600">{t('flavorChartEmpty')}</p>
          </div>
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
      {showBrewery && (
        <BottleSection label={t('theBreweryLabel')} testId="brand-brewery">
          <div className="flex flex-col gap-3">
            <p className="text-card-heading font-medium text-ink" lang="ja" data-testid="brewery-name-kanji">
              {brewery.nameKanji}
            </p>
            {prefecture && (
              <p className="text-body text-ash-600">
                <span lang="ja" data-testid="prefecture-name-ja">
                  {prefecture.nameJa}
                </span>
              </p>
            )}
            <BreweryOtherSakes brandId={brandId} instanceId={`brand-${brandId}`} />
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
