import { getTranslations } from 'next-intl/server'
import { getPathname } from '@/i18n/navigation'
import { ScanResultCard } from '@/components/scan/scan-result-card'
import { SAMPLE_SCAN_PHOTO_SRC, type LandingSampleScan } from '@/lib/landing/sample-scan'

/**
 * The hero's right column — design v1.4 §0: "phone placeholder (9:19, radius
 * 34) — **replace with a real app screenshot**".
 *
 * This is that screenshot, except live. UX-E (#166) already built a real
 * example scan — the maintainer's own photo of a catalogued sake, its real
 * flavor chart, and the reverse cross-beverage hook — reusing the exact
 * `<ScanResultCard />` a visitor sees after their own scan (issue #163 AC:
 * "the result card is a reusable component consumable by UX-E"). Framing it
 * as the device beats mocking one.
 *
 * **It used to be a section of its own**, with its own kicker, heading,
 * subhead and "Scan your own →" button, because #166 was built against the
 * old text-only landing — there was no hero to sit beside. Porting §0 on top
 * of it left the page carrying two answers to the same question: §0's hero
 * with an empty right column, and UX-E's block below it. Both designs wanted
 * one thing, "show the app next to the headline", so they are one thing now.
 * The heading and subhead are gone (§0's "Know what's in the cup." is the
 * page's one title) and so is the second CTA — `landing-scan-cta` in the left
 * column is the route into scan.
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
    // The device: §0's phone, 9:19 and radius 34.
    //
    // It **scrolls** rather than crops. The frame holds a live card — links,
    // the flavour-terms info button, the heuristic caveat — so cropping to
    // 9:19 would leave focusable, screen-reader-reachable content outside the
    // visible box. Scrolling keeps every one of them reachable and is what a
    // real phone does with this screen anyway.
    //
    // The aspect only applies from 700px, the width at which §0 says the hero
    // stops being two columns. Below that the frame is the column, so it takes
    // its natural height — a nested scroll area under a thumb is worse than a
    // tall section, and there is no phone to imitate when you are holding one.
    <section
      className="mx-auto w-full max-w-[390px] overflow-hidden rounded-[34px] ring-1 ring-divider min-[700px]:aspect-[9/19] min-[700px]:overflow-y-auto"
      data-testid="landing-hero"
    >
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
    </section>
  )
}
