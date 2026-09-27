import { getTranslations } from 'next-intl/server'
import { Link, getPathname } from '@/i18n/navigation'
import { ScanResultCard } from '@/components/scan/scan-result-card'
import { SAMPLE_SCAN_PHOTO_SRC, type LandingSampleScan } from '@/lib/landing/sample-scan'

/**
 * UX-E (#166): "show, don't tell" landing hero. Leads with a real example
 * scan result — the maintainer's own photo of a catalogued sake, its real
 * flavor chart, and the reverse cross-beverage hook — reusing the exact
 * `<ScanResultCard />` a visitor sees after their own scan (issue #163 AC:
 * "the result card is a reusable component consumable by UX-E").
 *
 * Server component: it only needs the resolved sample data + a localised
 * `sakeHref`, and delegates the flavor-data rendering (and its inherited
 * `<SakenowaAttribution />` + `<ProvenanceBadge />` + `<HeuristicDisclaimer />`)
 * to the client card. It renders ONLY post-age-gate acceptance — the caller
 * gates on `gateAccepted`, so no flavor data reaches the DOM before the
 * 18+ confirmation (JMStV; issue #166 AC).
 */
export async function LandingHero({
  sample,
  locale,
  headingLevel = 'h1',
}: {
  sample: LandingSampleScan
  locale: string
  /**
   * `h1` standalone, `h2` when §0's "Know what's in the cup." is above it.
   * A page with two `h1`s gives a screen-reader user two competing answers to
   * "what is this page", and the design has exactly one title.
   */
  headingLevel?: 'h1' | 'h2'
}) {
  const t = await getTranslations('landing.hero')

  // Pre-resolve the locale-aware detail path so the card can render it as a
  // plain `<a>` (the card takes a resolved string, mirroring scan-action).
  const sakeHref = getPathname({
    locale,
    href: {
      pathname: '/sake/[brandId]',
      params: { brandId: String(sample.brandId) },
    },
  })

  const Heading = headingLevel

  return (
    <section className="flex flex-col gap-6" data-testid="landing-hero">
      <div className="flex flex-col gap-2">
        <p className="text-section-label uppercase text-ash-600">{t('kicker')}</p>
        <Heading className="text-headline font-medium text-ink">
          {t('heading')}
        </Heading>
        <p className="max-w-prose text-body text-ash-600">{t('subhead')}</p>
      </div>

      {/*
        The example card. `extractionConfidence` is omitted on purpose —
        this is a curated Sakenowa row, not an `llm_extracted` scan, so
        there's no LLM provenance to badge. The photo is a committed
        static asset (not a visitor blob), passed straight to the card's
        native `<img>`.
      */}
      <ScanResultCard
        photoUrl={SAMPLE_SCAN_PHOTO_SRC}
        photoAlt={t('photoAlt')}
        sakeKanji={sample.sakeKanji}
        sakeRomaji={sample.sakeRomaji}
        breweryKanji={sample.breweryKanji}
        breweryRomaji={sample.breweryRomaji}
        sakeHref={sakeHref}
        flavorChart={sample.flavorChart}
        exampleLabel={t('exampleChip')}
      />

      <Link
        href="/scan"
        // Ash, not the near-white `dark:bg-zinc-100` this used to carry: with
        // the variant forced on (ADR-0023) that rendered a white slab on the
        // Ginshu ground. The design keeps buttons on the neutral ramp anyway —
        // "the accent never floods a surface".
        className="inline-flex h-12 w-fit items-center gap-1.5 rounded-lg bg-ash-200 px-5 text-card-heading font-medium text-ink transition-colors hover:bg-ash-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ginshu-600"
        data-testid="landing-hero-scan-cta"
      >
        {t('scanYourOwn')}
        <span aria-hidden>→</span>
      </Link>
    </section>
  )
}
