// E2E coverage for /[locale]/sake/[brandId].
//
// Two scenarios:
//
// 1. /de/sake/[brandId] rewrites to coming-soon. ADR-0008 keeps the German
//    locale gated until the Impressum is in place. The proxy intercepts
//    before the page renders; no DB call happens. Always runs; any
//    brandId works.
//
// 2. /en/sake/<brand> renders kanji + (when present) the 6-axis flavor
//    chart. Requires DATABASE_URL in the dev-server's environment. The
//    spec discovers a suitable brand at runtime via _db-fixtures helpers
//    instead of relying on a fixed seed — Sakenowa data shifts (new
//    placeholders, missing flavor_charts rows) won't silently turn
//    coverage into skips. CI skips this scenario; the
//    Vitest+testcontainers integration test in
//    src/lib/sakenowa/lookup.integration.test.ts covers the read-side
//    contract.
import { expect, test } from '@playwright/test'
import { BASE_URL } from './_base-url'
import { findAnyBrandId, findBrandWithFlavorChartId } from './_db-fixtures'

const AGE_GATE_COOKIE = {
  name: 'yawaragi_age_gate',
  value: JSON.stringify({ v: 1, ts: Date.now() }),
  url: BASE_URL,
}

let anyBrandId: number | null = null
let brandWithChartId: number | null = null

test.beforeAll(async () => {
  anyBrandId = await findAnyBrandId()
  brandWithChartId = await findBrandWithFlavorChartId()
})

test.describe('sake brand page', () => {
  test('/de/sake/<brandId> rewrites to coming-soon (DE locale gated, ADR-0008)', async ({
    browser,
  }) => {
    const context = await browser.newContext({ locale: 'en-US' })
    await context.addCookies([AGE_GATE_COOKIE])
    const page = await context.newPage()

    // The proxy intercepts /de/* before the brand lookup runs, so the
    // brandId value is structurally irrelevant — any token after /sake/
    // exercises the same code path.
    await page.goto('/de/sake/anything')

    await expect(page.getByTestId('coming-soon')).toBeVisible()
    // And the brand-page testid should NOT be present:
    await expect(page.getByTestId('sake-brand-page')).toHaveCount(0)

    await context.close()
  })

  test('/en/sake/<brand> renders the brand name', async ({ browser }, testInfo) => {
    testInfo.skip(
      anyBrandId === null,
      'DATABASE_URL not set or brands table empty — DB-bound spec',
    )

    const context = await browser.newContext({ locale: 'en-US' })
    await context.addCookies([AGE_GATE_COOKIE])
    const page = await context.newPage()

    await page.goto(`/en/sake/${anyBrandId}`)

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

  test('/en/sake/<brand-with-chart> renders the 6-axis flavor chart with a reachable brewers-term disclosure', async ({
    browser,
  }, testInfo) => {
    testInfo.skip(
      brandWithChartId === null,
      'DATABASE_URL not set or no brand-with-flavor-chart row in DB',
    )

    const context = await browser.newContext({ locale: 'en-US' })
    await context.addCookies([AGE_GATE_COOKIE])
    const page = await context.newPage()

    await page.goto(`/en/sake/${brandWithChartId}`)

    const chart = page.getByTestId('brand-flavor-chart')
    await expect(chart).toBeVisible()

    // ADR-0022: the axis reads as the locale word, and the Japanese term is
    // one tap away rather than inline. Both halves are asserted here — the
    // English label alone would be the regression the ADR forbids.
    const label = page.getByTestId('flavor-axis-f1')
    await expect(label).toBeVisible()
    await expect(label).toHaveText('Floral')

    // The instance id carries the brand id, so match on the prefix rather
    // than pinning a testid that changes with the fixture.
    const caveat = page
      .locator('[data-testid^="info-sheet-flavor-terms-"][data-testid$="-caveat"]')
      .first()
    await expect(caveat).toBeVisible()
    await expect(caveat).toHaveText(/brewers' terms/i)

    // Wired, not merely present: this is what a screen reader announces on
    // reaching the button, with the sheet never opened.
    const trigger = page
      .locator('[data-testid^="info-sheet-flavor-terms-"][data-testid$="-trigger"]')
      .first()
    await expect(trigger).toHaveAttribute(
      'aria-describedby',
      (await caveat.getAttribute('id')) ?? '',
    )

    // Opening it names the brewer's term the English word approximates.
    await trigger.click()
    const terms = page.getByTestId('flavor-terms-list')
    await expect(terms).toBeVisible()
    await expect(terms).toContainText('華やか')
    await expect(terms).toContainText('hanayaka')
    await expect(page.getByText(/approximations, not translations/i)).toBeVisible()

    await context.close()
  })
})
