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
}: {
  sample: LandingSampleScan
  locale: string
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

  return (
    <section className="flex flex-col gap-6" data-testid="landing-hero">
      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          {t('kicker')}
        </p>
        <h1 className="text-4xl font-semibold leading-tight tracking-tight">
          {t('heading')}
        </h1>
        <p className="max-w-prose text-base text-zinc-600 dark:text-zinc-400">
          {t('subhead')}
        </p>
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
      />

      <Link
        href="/scan"
        className="inline-flex w-fit items-center gap-1.5 rounded-lg bg-zinc-900 px-5 py-3 text-base font-medium text-white transition-colors hover:bg-zinc-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300 dark:focus-visible:outline-zinc-100"
        data-testid="landing-hero-scan-cta"
      >
        {t('scanYourOwn')}
        <span aria-hidden>→</span>
      </Link>
    </section>
  )
}
