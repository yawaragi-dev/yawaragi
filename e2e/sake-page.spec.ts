// E2E coverage for /[locale]/sake/[brandId].
import { BASE_URL } from './_base-url'
//
// Two scenarios:
//
// 1. /de/sake/[brandId] rewrites to coming-soon. ADR-0008 keeps the German
//    locale gated until the Impressum is in place. The proxy intercepts
//    before the page renders; no DB call happens. Always runs.
//
// 2. /en/sake/[seedBrandId] renders kanji + romaji. Requires DATABASE_URL
//    in the dev-server's environment AND a seeded brand row (brand_id =
//    E2E_SEED_BRAND_ID, default 1). The Playwright webServer inherits
//    process.env, so set both before running:
//
//      DATABASE_URL=postgres://... E2E_SEED_BRAND_ID=1 pnpm test:e2e
//
//    CI skips this scenario; the Vitest+testcontainers integration test in
//    src/lib/sakenowa/lookup.integration.test.ts covers the read-side
//    contract.
import { expect, test } from '@playwright/test'

const AGE_GATE_COOKIE = {
  name: 'yawaragi_age_gate',
  value: JSON.stringify({ v: 1, ts: Date.now() }),
  url: BASE_URL,
}

const SEED_BRAND_ID = Number.parseInt(process.env.E2E_SEED_BRAND_ID ?? '1', 10)
const HAS_DB = Boolean(process.env.DATABASE_URL)

test.describe('sake brand page', () => {
  test('/de/sake/<brandId> rewrites to coming-soon (DE locale gated, ADR-0008)', async ({
    browser,
  }) => {
    const context = await browser.newContext({ locale: 'en-US' })
    await context.addCookies([AGE_GATE_COOKIE])
    const page = await context.newPage()

    await page.goto(`/de/sake/${SEED_BRAND_ID}`)

    await expect(page.getByTestId('coming-soon')).toBeVisible()
    // And the brand-page testid should NOT be present:
    await expect(page.getByTestId('sake-brand-page')).toHaveCount(0)

    await context.close()
  })

  test('/en/sake/<seed> renders the brand name', async ({ browser }, testInfo) => {
    testInfo.skip(
      !HAS_DB,
      'requires DATABASE_URL in the dev-server env + a seeded brand row (see header comment)',
    )

    const context = await browser.newContext({ locale: 'en-US' })
    await context.addCookies([AGE_GATE_COOKIE])
    const page = await context.newPage()

    await page.goto(`/en/sake/${SEED_BRAND_ID}`)

    await expect(page.getByTestId('sake-brand-page')).toBeVisible()
    // Kanji is always shown. Romaji is only rendered when it differs from
    // kanji (Sakenowa-sourced rows currently have name === nameKanji, so
    // the romaji <p> is omitted). Don't assert on `*-name-romaji`.
    await expect(page.getByTestId('brand-name-kanji')).toBeVisible()
    await expect(page.getByTestId('brand-name-kanji')).toHaveAttribute('lang', 'ja')

    // Slice 5: brewery section renders below the brand.
    await expect(page.getByTestId('brand-brewery')).toBeVisible()
    await expect(page.getByTestId('brewery-name-kanji')).toBeVisible()
    await expect(page.getByTestId('brewery-name-kanji')).toHaveAttribute('lang', 'ja')

    // Slice 7: Sakenowa attribution appears above the fold (above the brand
    // kanji <h1>) — Sakenowa's licence forbids footer-only attribution.
    const attribution = page.getByTestId('sakenowa-attribution-above-fold')
    await expect(attribution).toBeVisible()
    await expect(attribution).toContainText('Powered by Sakenowa')
    const attributionLink = attribution.getByRole('link', { name: 'Visit Sakenowa' })
    await expect(attributionLink).toHaveAttribute('href', 'https://sakenowa.com')
    await expect(attributionLink).toHaveAttribute('target', '_blank')
    await expect(attributionLink).toHaveAttribute('rel', 'noopener noreferrer')

    // DOM order: attribution before brand kanji, confirming "above the fold"
    // is a structural guarantee, not just CSS. compareDocumentPosition's
    // FOLLOWING bit (0x04) is set when the second arg follows the first.
    const isAttributionBeforeKanji = await page.evaluate(() => {
      const a = document.querySelector('[data-testid="sakenowa-attribution-above-fold"]')
      const b = document.querySelector('[data-testid="brand-name-kanji"]')
      if (!a || !b) return false
      return (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0
    })
    expect(isAttributionBeforeKanji).toBe(true)

    // Slice 8: <ProvenanceBadge /> is imported on this page but renders
    // null for canonical sources. All Phase 2 brand rows are
    // source: 'sakenowa', so no badge should appear. The absence is the
    // test — Phase 3+ will assert the inverse on LLM-sourced surfaces.
    await expect(page.getByTestId('provenance-badge')).toHaveCount(0)

    await context.close()
  })

  test('/en/sake/<seed> renders the 6-axis flavor chart with romaji + kanji', async ({
    browser,
  }, testInfo) => {
    testInfo.skip(
      !HAS_DB,
      'requires DATABASE_URL in the dev-server env + a seeded brand row with a flavor_charts row',
    )

    const context = await browser.newContext({ locale: 'en-US' })
    await context.addCookies([AGE_GATE_COOKIE])
    const page = await context.newPage()

    await page.goto(`/en/sake/${SEED_BRAND_ID}`)

    // The chart only renders when a flavor_charts row exists for the brand;
    // Sakenowa publishes ~1355 charts vs. ~3167 brands, so some seeded
    // brand_ids won't have one. Skip cleanly rather than failing if the
    // chosen seed isn't covered.
    const chart = page.getByTestId('brand-flavor-chart')
    if ((await chart.count()) === 0) {
      testInfo.skip(true, `brand ${SEED_BRAND_ID} has no flavor_chart row; pick another seed`)
      return
    }

    await expect(chart).toBeVisible()

    // f1 (hanayaka / 華やか) is enough to prove the romaji + kanji rule.
    const romaji = page.getByTestId('flavor-axis-f1-romaji')
    const kanji = page.getByTestId('flavor-axis-f1-kanji')
    await expect(romaji).toBeVisible()
    await expect(romaji).toHaveText('hanayaka')
    await expect(kanji).toBeVisible()
    await expect(kanji).toHaveText('華やか')
    await expect(kanji).toHaveAttribute('lang', 'ja')

    // Tooltip text is in the DOM and reachable via aria-describedby; visual
    // visibility is hover/focus-driven (CSS-only, no JS handler).
    const tooltip = page.getByTestId('flavor-axis-f1-tooltip')
    await expect(tooltip).toHaveText(/fragrant \/ floral/)
    await expect(tooltip).toHaveText(/brewer's term/)

    const root = page.getByTestId('flavor-axis-f1')
    await expect(root).toHaveAttribute('aria-describedby', 'flavor-axis-f1-tooltip')

    // Focusing makes the tooltip visually appear (group-focus-visible toggles
    // opacity on the role=tooltip span).
    await root.focus()
    await expect(tooltip).toBeVisible()

    await context.close()
  })
})
