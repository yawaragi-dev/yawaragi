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

/**
 * The bounding box of an element that has stopped animating. Polls until two
 * consecutive reads agree, so callers measure the resting position rather
 * than wherever a transition happened to be when `toBeVisible()` resolved.
 */
async function settledBox(locator: import('@playwright/test').Locator): Promise<string> {
  let previous = ''
  for (let i = 0; i < 40; i++) {
    const current = JSON.stringify(await locator.boundingBox())
    if (current === previous) return current
    previous = current
    await locator.page().waitForTimeout(50)
  }
  return previous
}

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

    // Slice 8: <ProvenanceBadge /> renders null for canonical sources, so the
    // brand RECORD (source: 'sakenowa') carries no badge. The romaji FIELDS
    // are a different story — they are Hepburn romanisations produced by an
    // LLM, so CLAUDE.md requires a badge on each.
    //
    // This used to assert `toHaveCount(0)` outright, on the premise that
    // "Sakenowa-sourced rows have name === nameKanji so the romaji <p> is
    // omitted". That premise expired when the romaji backfill populated the
    // mirror: locally the page now renders two `llm_inferred` badges and the
    // assertion failed on every run, while staying green on CI only because
    // CI has no DATABASE_URL and skips the whole spec. A test that can only
    // pass where it never runs is not a test.
    //
    // Asserted as a relationship instead of a count, so it holds whether or
    // not a given row has romaji: every badge on this page belongs to a
    // romaji field, and none sits beside the canonical kanji.
    // Stated in both directions so deleting the badges cannot make this pass:
    // every romaji field that IS rendered must carry exactly one
    // `llm_inferred` badge, and no badge may sit anywhere else on the page.
    for (const field of ['brand-name-romaji', 'brewery-name-romaji']) {
      const romaji = page.getByTestId(field)
      if ((await romaji.count()) === 0) continue
      const badge = romaji.getByTestId('provenance-badge')
      await expect(badge).toHaveCount(1)
      await expect(badge).toHaveAttribute('data-kind', 'llmInferred')
    }

    const badgesOutsideRomaji = await page.evaluate(
      () =>
        [...document.querySelectorAll('[data-testid="provenance-badge"]')].filter(
          (b) =>
            !b.closest(
              '[data-testid="brand-name-romaji"], [data-testid="brewery-name-romaji"]',
            ),
        ).length,
    )
    // The part the old assertion was reaching for: the canonical brand
    // heading, and every other Sakenowa-sourced value, carries no badge.
    expect(badgesOutsideRomaji).toBe(0)

    await context.close()
  })

  test('a provenance badge explains itself in a sheet that fits the screen', async ({
    browser,
  }, testInfo) => {
    testInfo.skip(anyBrandId === null, 'DB-bound spec')

    const context = await browser.newContext({ locale: 'en-US' })
    await context.addCookies([AGE_GATE_COOKIE])
    const page = await context.newPage()
    await page.setViewportSize({ width: 390, height: 844 })

    await page.goto(`/en/sake/${anyBrandId}`)

    const badge = page.getByTestId('provenance-badge').first()
    await expect(badge).toBeVisible()

    // The bug this replaced: the explanation was an `absolute left-0 w-max`
    // tooltip, and at 390px a badge at x=141 put a 320px panel at x=462 — 72px
    // off-screen, reported as text cut mid-sentence. A width clamp cannot fix
    // it, because the box is anchored to the badge.
    await badge.click()

    const panel = page.locator('[data-testid^="info-sheet-provenance-"][data-testid$="-panel"]')
    await expect(panel).toBeVisible()

    // The sheet slides in, so the first box after `visible` is mid-transition.
    // A vertical slide leaves the x-axis stable, which is what this asserts —
    // but measure the settled box anyway, so the assertion stays honest if the
    // animation ever gains a horizontal component.
    await expect
      .poll(async () => JSON.stringify(await panel.boundingBox()))
      .toBe(await settledBox(panel))

    const box = await panel.boundingBox()
    expect(box).not.toBeNull()
    expect(box!.x).toBeGreaterThanOrEqual(0)
    expect(box!.x + box!.width).toBeLessThanOrEqual(390 + 1)

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
