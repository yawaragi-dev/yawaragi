// E2E coverage for the UX-E (#166) landing hero.
//
// Two things matter here and can only be verified against the rendered
// page (the landing is an async RSC — Vitest can't render it):
//
// 1. COMPLIANCE: no Sakenowa flavor data reaches the DOM before the 18+
//    age gate is accepted (JMStV). Pre-acceptance the page must show its
//    text intro + the gate, never the example result card. Always runs —
//    no DB needed, because the assertion is about ABSENCE.
//
// 2. THE MONEY-SHOT: post-acceptance the hero leads with a real example
//    scan result — the reused <ScanResultCard /> over the curated sample
//    sake (木戸泉), carrying its flavor chart, the reverse cross-beverage
//    hook, the inline Sakenowa attribution, and the heuristic disclaimer —
//    plus a "Scan your own →" CTA into /scan. DB-bound; skips when the
//    sample row isn't in the mirror (CI has no DATABASE_URL).
import { expect, test } from '@playwright/test'
import { BASE_URL } from './_base-url'
import { findLandingSampleBrandId } from './_db-fixtures'

const AGE_GATE_COOKIE = {
  name: 'yawaragi_age_gate',
  value: JSON.stringify({ v: 1, ts: Date.now() }),
  url: BASE_URL,
}

// The consent banner is fixed above the bottom edge, so it sits over anything
// low on the page. Specs that CLICK something down there decide the banner
// out of the way rather than relying on the viewport being tall enough — the
// same interception that bit the age gate.
const CONSENT_COOKIE = {
  name: 'yawaragi_consent',
  value: JSON.stringify({ version: 1, analytics: false, marketing: false }),
  url: BASE_URL,
}

let sampleBrandId: number | null = null

test.beforeAll(async () => {
  sampleBrandId = await findLandingSampleBrandId()
})

test.describe('landing hero (UX-E)', () => {
  test('pre-acceptance: no flavor data in the DOM, gate is shown', async ({
    browser,
  }) => {
    // Fresh context with NO age-gate cookie.
    const context = await browser.newContext({ locale: 'en-US' })
    const page = await context.newPage()
    await page.goto('/en')

    // The gate is present and the example result card is not — no flavor
    // chart, no reverse cross-beverage hook, no result card at all.
    await expect(page.getByTestId('age-gate')).toBeVisible()
    await expect(page.getByTestId('landing-hero')).toHaveCount(0)
    await expect(page.getByTestId('scan-result-card')).toHaveCount(0)
    await expect(page.getByTestId('brand-flavor-chart')).toHaveCount(0)
    await expect(page.getByTestId('scan-result-reverse-exemplar')).toHaveCount(0)

    await context.close()
  })

  test('post-acceptance: hero leads with the real example result card', async ({
    browser,
  }, testInfo) => {
    testInfo.skip(
      sampleBrandId === null,
      'DATABASE_URL not set or sample brand (310) missing — DB-bound spec',
    )

    const context = await browser.newContext({ locale: 'en-US' })
    await context.addCookies([AGE_GATE_COOKIE])
    const page = await context.newPage()
    await page.goto('/en')

    // The hero and the reused result card render.
    await expect(page.getByTestId('landing-hero')).toBeVisible()
    const card = page.getByTestId('scan-result-card')
    await expect(card).toBeVisible()

    // Real flavor data + the reverse cross-beverage hook (a 'match' for
    // this rich profile) + its mandatory provenance framing.
    await expect(card.getByTestId('brand-flavor-chart')).toBeVisible()
    await expect(
      card.getByTestId('scan-result-reverse-exemplar-match'),
    ).toBeVisible()
    await expect(card.getByTestId('heuristic-disclaimer')).toBeVisible()
    // v1.5 §5: the card's Sakenowa credit is its identity block's last line.
    await expect(card.getByTestId('sakenowa-attribution-identity')).toBeVisible()

    // The sample's kanji is shown verbatim.
    await expect(card.getByTestId('scan-result-name-kanji')).toHaveText('木戸泉')

    // UX-F (#167): the hero card is flagged as an example so a visitor
    // can't mistake the curated sample for their own scan.
    await expect(card.getByTestId('scan-result-example-badge')).toBeVisible()

    // UX-F (#167): the cross-beverage disclaimer body lives in a tooltip on
    // an info button — hovering reveals it (opacity 0 → 1), AND the card must
    // not clip it. Regression guard for the specific bug where the card's
    // `overflow-hidden` cut off the bottom of the tooltip: pin that the card
    // does not establish an overflow clip, so a bottom-edge tooltip escapes.
    const disclaimer = card.getByTestId('heuristic-disclaimer')
    const disclaimerBody = disclaimer.getByTestId('heuristic-disclaimer-body')
    await expect(disclaimerBody).toHaveCSS('opacity', '0')
    await disclaimer.getByRole('button').hover()
    await expect(disclaimerBody).toHaveCSS('opacity', '1')
    await expect(card).not.toHaveCSS('overflow-y', 'hidden')
    await expect(card).not.toHaveCSS('overflow-x', 'hidden')

    await context.close()
  })

  test('the feature cards have an edge, not just a lift off the ground', async ({
    browser,
  }) => {
    const context = await browser.newContext({ locale: 'en-US' })
    await context.addCookies([AGE_GATE_COOKIE, CONSENT_COOKIE])
    const page = await context.newPage()

    await page.goto('/en')

    // Reported on sight, and the reason the icon looked loose on its own line:
    // the cards were ported without the prototype's `shadow-sm`, which on this
    // ground is a 1px hairline rather than a drop shadow. `bg-surface` alone is
    // a 9% lift off `bg-ground`, with nothing marking where the card ends.
    //
    // Asserted as "has a shadow at all" rather than the exact value: the hue is
    // still #308's question for the designers, and pinning `0 0 0 1px #302e2c`
    // would fail on an answer we asked for. Removing the class fails this.
    for (const testId of [
      'landing-feature-identify',
      'landing-feature-rate',
      'landing-feature-palate',
    ]) {
      const shadow = await page
        .getByTestId(testId)
        .evaluate((el) => getComputedStyle(el).boxShadow)
      expect(shadow, `${testId} should have an edge`).not.toBe('none')
    }

    await context.close()
  })

  // §0 aims both "Open the app" buttons at the app's front door, which is §3
  // Home. They pointed at `/scan` for three PRs while `/home` rendered
  // `<TabPlaceholder />`; §3 is ported now and they are back where §0 put
  // them. The rule pinned here is the outcome rather than the destination —
  // the landing's way into the app must reach something finished — which is
  // why this test did not need changing when the href did.
  //
  // One test per button rather than a loop inside one, so a failure names
  // which of the two broke instead of reporting the first one it reached.
  for (const testId of ['landing-open-app', 'landing-privacy-cta'] as const) {
    test(`"${testId}" lands on a built screen, not scaffolding`, async ({ browser }) => {
      const context = await browser.newContext({ locale: 'en-US' })
      await context.addCookies([AGE_GATE_COOKIE, CONSENT_COOKIE])
      const page = await context.newPage()

      await page.goto('/en')
      await page.getByTestId(testId).click()

      await expect(page.getByTestId('tab-bar')).toBeVisible()
      await expect(page.getByTestId('tab-placeholder')).toHaveCount(0)
      // And specifically the front door, now that there is one.
      await expect(page).toHaveURL(/\/en\/home$/)
      await expect(page.getByTestId('home-page')).toBeVisible()

      await context.close()
    })
  }

  test('post-acceptance: the landing CTA routes into the scan flow', async ({
    browser,
  }, testInfo) => {
    testInfo.skip(
      sampleBrandId === null,
      'DATABASE_URL not set or sample brand (310) missing — DB-bound spec',
    )

    const context = await browser.newContext({ locale: 'en-US' })
    await context.addCookies([AGE_GATE_COOKIE])
    const page = await context.newPage()
    await page.goto('/en')

    // #166's AC is that the landing's CTA routes into the scan flow. The hero
    // used to carry a second "Scan your own →" button of its own; collapsing
    // the example into §0's right column left one route in, which is what §0
    // specifies.
    await page.getByTestId('landing-scan-cta').click()
    await expect(page).toHaveURL(/\/en\/scan$/)

    await context.close()
  })
})
