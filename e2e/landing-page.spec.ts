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
    await expect(card.getByTestId('sakenowa-attribution-inline')).toBeVisible()

    // The sample's kanji is shown verbatim.
    await expect(card.getByTestId('scan-result-name-kanji')).toHaveText('木戸泉')

    // UX-F (#167): the hero card is flagged as an example so a visitor
    // can't mistake the curated sample for their own scan.
    await expect(card.getByTestId('scan-result-example-badge')).toBeVisible()

    await context.close()
  })

  test('post-acceptance: "Scan your own" CTA routes into the scan flow', async ({
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

    await page.getByTestId('landing-hero-scan-cta').click()
    await expect(page).toHaveURL(/\/en\/scan$/)

    await context.close()
  })
})
