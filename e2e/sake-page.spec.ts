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
import {
  findAnyBrandId,
  findBrandWithFlavorChartId,
  findMatchedNoChartFixture,
} from './_db-fixtures'

const AGE_GATE_COOKIE = {
  name: 'yawaragi_age_gate',
  value: JSON.stringify({ v: 1, ts: Date.now() }),
  url: BASE_URL,
}

let anyBrandId: number | null = null
let brandWithChartId: number | null = null
let brandWithoutChartId: number | null = null

test.beforeAll(async () => {
  anyBrandId = await findAnyBrandId()
  brandWithChartId = await findBrandWithFlavorChartId()
  brandWithoutChartId = (await findMatchedNoChartFixture())?.brandId ?? null
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

    // Slice 5: the brewery section. §9.9 is "hidden without data" and its
    // data is the row of other sakes, so the section and the row come and go
    // together — whichever this fixture's brewery happens to have.
    const brewerySection = page.getByTestId('brand-brewery')
    const hasBrewerySection = (await brewerySection.count()) > 0
    await expect(brewerySection.getByTestId('brewery-other-sakes')).toHaveCount(
      hasBrewerySection ? 1 : 0,
    )
    if (hasBrewerySection) {
      await expect(brewerySection.getByTestId('brewery-name-kanji')).toHaveAttribute('lang', 'ja')
    }

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

    // Romaji provenance. The brand RECORD is Sakenowa-sourced and carries no
    // affordance; the romaji FIELDS are Hepburn romanisations produced by an
    // LLM, so CLAUDE.md requires that neither appears without one.
    //
    // §9 serves that with ONE §16 disclosure for the identity block rather
    // than a `<ProvenanceBadge />` per field: at 390px a chip never fits
    // beside 25px type, so it wrapped to its own line and split the page's
    // most important element into name / chip / kana / brewery / chip. The
    // compliance property is unchanged and is the one CLAUDE.md spells out for
    // `<HeuristicDisclaimer />` — the caveat is in the DOM and
    // `aria-describedby` reaches it with no interaction.
    //
    // Three things are asserted, so no single deletion can make this pass:
    // the romaji fields are marked, the caveat is present and non-empty, and
    // the sheet that explains it is reachable.
    const romajiFields = page.locator('[data-romaji-field]')
    expect(await romajiFields.count()).toBeGreaterThan(0)
    for (const field of ['brand-name-romaji', 'brewery-name-romaji']) {
      const romaji = page.getByTestId(field)
      if ((await romaji.count()) === 0) continue
      await expect(romaji).toHaveAttribute('data-romaji-field', '')
    }

    const disclosure = page
      .locator('[data-testid^="info-sheet-brand-"][data-testid$="-identity-romaji"]')
      .first()
    await expect(disclosure).toBeVisible()
    const caveat = disclosure.locator('[data-testid$="-caveat"]')
    await expect(caveat).toBeVisible()
    expect((await caveat.innerText()).trim().length).toBeGreaterThan(0)
    // `aria-describedby` points at that caveat — the part a screen reader
    // follows without opening anything.
    const trigger = disclosure.getByRole('button')
    await expect(trigger).toHaveAttribute('aria-describedby', (await caveat.getAttribute('id'))!)

    // And nothing carries a badge beside a canonical Sakenowa value. This is
    // the half the old assertion was reaching for, kept: the brand heading,
    // the brewery kanji and the chart values are canonical and must stay bare.
    const badgesOutsideRomaji = await page.evaluate(
      () =>
        [...document.querySelectorAll('[data-testid="provenance-badge"]')].filter(
          (b) => !b.closest('[data-romaji-field]'),
        ).length,
    )
    expect(badgesOutsideRomaji).toBe(0)

    await context.close()
  })

  test('states what this bottle lacks, and shows nothing no bottle has', async ({
    browser,
  }, testInfo) => {
    testInfo.skip(brandWithoutChartId === null, 'DB-bound spec')

    const context = await browser.newContext({ locale: 'en-US' })
    await context.addCookies([AGE_GATE_COOKIE])
    const page = await context.newPage()
    await page.setViewportSize({ width: 390, height: 844 })

    await page.goto(`/en/sake/${brandWithoutChartId}`)
    await expect(page.getByTestId('sake-brand-page')).toBeVisible()

    // Design v1.4 rule 4: "Missing data is stated, not hidden." About half the
    // catalogue has a flavor chart, so its absence is a fact about THIS
    // bottle, and the page says so.
    const emptyChart = page.getByTestId('bottle-flavor-chart-empty')
    await expect(emptyChart).toBeVisible()
    // ...without the axis-terms info button: with no chart there are no axis
    // labels on screen for it to explain.
    await expect(
      emptyChart.locator('[data-testid^="info-sheet-flavor-terms-"]'),
    ).toHaveCount(0)

    // Sections with no source for ANY bottle are switched off (`FEATURES`,
    // #336–#340) rather than shown empty on all ~3,000 pages. When one lands,
    // its issue flips the flag and moves it out of this list.
    for (const section of [
      'bottle-serve',
      'bottle-specs',
      'bottle-pairings',
      'bottle-community',
      'bottle-shops',
    ]) {
      await expect(page.getByTestId(section)).toHaveCount(0)
    }

    await context.close()
  })

  test('offers "Similar" only for a bottle that has a flavor chart to compare by', async ({
    browser,
  }, testInfo) => {
    testInfo.skip(brandWithChartId === null || brandWithoutChartId === null, 'DB-bound spec')

    const context = await browser.newContext({ locale: 'en-US' })
    await context.addCookies([AGE_GATE_COOKIE])
    const page = await context.newPage()

    // Similarity is distance over the six axes, so without a chart §6 can
    // only say "no chart yet". The page knows up front and does not offer
    // a tap that leads nowhere.
    await page.goto(`/en/sake/${brandWithChartId}`)
    await expect(page.getByTestId('similar-sakes-link')).toBeVisible()

    await page.goto(`/en/sake/${brandWithoutChartId}`)
    await expect(page.getByTestId('sake-brand-page')).toBeVisible()
    await expect(page.getByTestId('similar-sakes-link')).toHaveCount(0)
    await expect(page.getByTestId('bottle-actions')).toHaveCount(0)

    await context.close()
  })

  test('a visitor who can keep a journal rates a new tasting right on the bottle page', async ({
    browser,
  }, testInfo) => {
    testInfo.skip(brandWithChartId === null, 'DB-bound spec')

    const context = await browser.newContext({ locale: 'en-US' })
    // The stub stands in for ADR-0020's maintainer check, as on Collection.
    await context.addCookies([
      AGE_GATE_COOKIE,
      { name: 'yawaragi_journal_stub', value: 'empty', url: BASE_URL },
    ])
    const page = await context.newPage()
    await page.goto(`/en/sake/${brandWithChartId}`)

    // §9.2: the personal action first, "Similar" beside it.
    await expect(page.getByTestId('bottle-rate-open')).toContainText('Rate a new tasting')
    await expect(page.getByTestId('similar-sakes-link')).toBeVisible()
    // The cellar control, for a sake this visitor does not own yet.
    await expect(page.getByTestId('cellar-add')).toHaveText('Add to cellar')
    // §9.3, with nothing in it yet.
    await expect(page.getByTestId('bottle-history')).toContainText('You and this sake')
    await expect(page.getByTestId('bottle-history-empty')).toContainText('Not tasted yet.')

    // §5's panel opens in place; the button gives way to it.
    await page.getByTestId('bottle-rate-open').click()
    const panel = page.getByTestId('tasting-log-panel')
    await expect(panel).toContainText('First time for you')
    await expect(panel).toContainText('Tap a star and it’s logged')
    await expect(page.getByTestId('bottle-rate-open')).toHaveCount(0)

    // The stub draws the screen; it does not fake a store. The server
    // refuses a visitor who is not really a maintainer, and the panel says
    // the save did not happen rather than pretending it did.
    await panel.getByRole('button', { name: 'Rate 4 stars' }).click()
    await expect(page.getByTestId('tasting-log-error')).toBeVisible()
    await expect(page.getByTestId('tasting-log-rating')).toHaveText('Tap to rate')

    await context.close()
  })

  test('"Pour & rate" from the Cellar lands with the panel already open', async ({
    browser,
  }, testInfo) => {
    testInfo.skip(brandWithChartId === null, 'DB-bound spec')

    const context = await browser.newContext({ locale: 'en-US' })
    await context.addCookies([
      AGE_GATE_COOKIE,
      { name: 'yawaragi_journal_stub', value: 'empty', url: BASE_URL },
    ])
    const page = await context.newPage()
    await page.goto(`/en/sake/${brandWithChartId}?rate=1`)

    await expect(page.getByTestId('tasting-log-panel')).toBeVisible()
    await expect(page.getByTestId('bottle-rate-open')).toHaveCount(0)

    await context.close()
  })

  test('everyone else sees no rating and no tasting history', async ({ browser }, testInfo) => {
    testInfo.skip(brandWithChartId === null, 'DB-bound spec')

    const context = await browser.newContext({ locale: 'en-US' })
    await context.addCookies([AGE_GATE_COOKIE])
    const page = await context.newPage()
    await page.goto(`/en/sake/${brandWithChartId}`)

    await expect(page.getByTestId('sake-brand-page')).toBeVisible()
    await expect(page.getByTestId('bottle-rate-open')).toHaveCount(0)
    await expect(page.getByTestId('bottle-history')).toHaveCount(0)
    await expect(page.getByTestId('cellar-add')).toHaveCount(0)
    await expect(page.getByTestId('similar-sakes-link')).toBeVisible()

    await context.close()
  })

  test('offers a way back out, which the bottle page had none of', async ({
    browser,
  }, testInfo) => {
    testInfo.skip(anyBrandId === null, 'DB-bound spec')

    const context = await browser.newContext({ locale: 'en-US' })
    await context.addCookies([AGE_GATE_COOKIE])
    const page = await context.newPage()

    // Rule 11: every screen that is not a tab main screen carries the arrow.
    // The bottle page is reached from scan, search and similar-sakes and had
    // no back affordance at all until §9 — a visitor's only exit was a tab,
    // which clears the history they came through.
    await page.goto('/en/scan')
    await expect(page.getByTestId('back-link')).toHaveCount(0)

    await page.goto(`/en/sake/${anyBrandId}`)
    const back = page.getByTestId('back-link')
    await expect(back).toBeVisible()

    // A cold deep link has no history to pop, so the arrow must still be a
    // real anchor rather than a control that does nothing.
    await expect(back).toHaveAttribute('href', '/en/home')

    await context.close()
  })

  test('an inferred-claim sheet fits the screen it opens on', async ({
    browser,
  }, testInfo) => {
    testInfo.skip(anyBrandId === null, 'DB-bound spec')

    const context = await browser.newContext({ locale: 'en-US' })
    await context.addCookies([AGE_GATE_COOKIE])
    const page = await context.newPage()
    await page.setViewportSize({ width: 390, height: 844 })

    await page.goto(`/en/sake/${anyBrandId}`)

    // The subject is `<InfoSheetPanel />`, the primitive every §16 disclosure
    // and the provenance badge share. On this page it is reached through the
    // romaji disclosure; the badge, which renders on the scan card, opens the
    // same panel.
    //
    // The bug this guards: the explanation used to be an `absolute left-0
    // w-max` tooltip, and at 390px a trigger at x=141 put a 320px panel at
    // x=462 — 72px off-screen, reported as text cut mid-sentence. A width
    // clamp cannot fix it, because the box is anchored to the trigger. A
    // bottom sheet is viewport-sized by construction, and this asserts it.
    const openSheet = page
      .locator('[data-testid^="info-sheet-brand-"][data-testid$="-identity-romaji"]')
      .first()
      .getByRole('button')
    await expect(openSheet).toBeVisible()
    await openSheet.click()

    const panel = page.locator('[data-testid$="-panel"]').first()
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
