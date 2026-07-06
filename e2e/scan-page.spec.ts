// E2E coverage for /[locale]/scan.
//
// Post-ADR-0015 / #163:
//
// 1. /en/scan is FULLY age-gated (was ungated pre-#163 as a discovery
//    affordance). Without the gate cookie, the proxy rewrites to the
//    landing gate.
// 2. /de/scan renders the coming-soon page (ADR-0008 keeps the German
//    locale gated until the Impressum is in place). Always runs.
// 3. /en/scan → upload → matched result renders IN PLACE (no more auto-
//    navigate to /sake/[brandId]). The rich result card shows the
//    visitor's photo, the sake kanji + romaji, the flavor chart, and a
//    "See full details →" link back to the deep-dive page. Requires
//    DATABASE_URL + a Sakenowa-published Dassai row; the vision provider
//    is `e2e-stub` under Playwright.
import { expect, test } from '@playwright/test'
import { BASE_URL } from './_base-url'
import { findScanS1FixtureBrandId } from './_db-fixtures'

const AGE_GATE_COOKIE = {
  name: 'yawaragi_age_gate',
  value: JSON.stringify({ v: 1, ts: Date.now() }),
  url: BASE_URL,
}

const FIXTURE_IMAGE = 'e2e/fixtures/dassai-label.jpg'

let dassaiBrandId: number | null = null

test.beforeAll(async () => {
  dassaiBrandId = await findScanS1FixtureBrandId()
})

test.describe('scan entry route', () => {
  test('/en/scan is gated — no cookie → landing gate rewrite (ADR-0015)', async ({
    browser,
  }) => {
    const context = await browser.newContext({ locale: 'en-US' })
    // Deliberately no age-gate cookie. Post-ADR-0015 the whole /scan
    // route is gated, so the proxy rewrites to the landing gate — the
    // scan form (and its localized entry copy) must not render.
    const page = await context.newPage()

    await page.goto('/en/scan')

    // The rewrite lands us on the landing page rendered under the /scan
    // URL. The gate dialog is present; the scan form is not.
    await expect(page.getByTestId('age-gate')).toBeVisible()
    await expect(page.getByTestId('scan-entry-page')).toHaveCount(0)
    await expect(page.getByTestId('scan-pick-button')).toHaveCount(0)

    await context.close()
  })

  test('/en/scan renders the entry CTA when the gate cookie is set', async ({
    browser,
  }) => {
    const context = await browser.newContext({ locale: 'en-US' })
    await context.addCookies([AGE_GATE_COOKIE])
    const page = await context.newPage()

    await page.goto('/en/scan')

    await expect(page.getByTestId('scan-entry-page')).toBeVisible()
    await expect(page.getByTestId('scan-pick-button')).toBeVisible()
    // The gate dialog does NOT render — we already accepted.
    await expect(page.getByTestId('age-gate')).toHaveCount(0)

    await context.close()
  })

  test('/de/scan renders coming-soon (DE locale gated, ADR-0008)', async ({
    browser,
  }) => {
    const context = await browser.newContext({ locale: 'de-DE' })
    await context.addCookies([AGE_GATE_COOKIE])
    const page = await context.newPage()

    await page.goto('/de/scan')

    await expect(page.getByTestId('coming-soon')).toBeVisible()
    await expect(page.getByTestId('scan-entry-page')).toHaveCount(0)

    await context.close()
  })

  test('/en/scan upload → matched → renders result card in place (ADR-0015)', async ({
    browser,
  }, testInfo) => {
    testInfo.skip(
      dassaiBrandId === null,
      'DATABASE_URL not set or Dassai (獺祭 / 旭酒造) not in the Sakenowa mirror — DB-bound spec',
    )

    const context = await browser.newContext({ locale: 'en-US' })
    await context.addCookies([AGE_GATE_COOKIE])
    const page = await context.newPage()

    await page.goto('/en/scan')
    await expect(page.getByTestId('scan-entry-page')).toBeVisible()

    // The file input is `sr-only`, so set the file directly on it rather
    // than driving the OS file picker dialog (which Playwright won't
    // open here). Picking a file fires the change handler the same way.
    await page.getByTestId('scan-file-input').setInputFiles(FIXTURE_IMAGE)

    // Post-ADR-0015: the result renders IN PLACE. We stay on /en/scan.
    await expect(page.getByTestId('scan-result-card')).toBeVisible()
    expect(page.url()).toMatch(/\/en\/scan$/)

    // The card carries the visitor's own photo preview (blob: URL —
    // client-only object URL, never uploaded/persisted).
    const photoSrc = await page.getByTestId('scan-result-photo').getAttribute('src')
    expect(photoSrc).toMatch(/^blob:/)

    // The kanji renders adjacent to the LLM-extracted provenance badge.
    await expect(page.getByTestId('scan-result-name-kanji')).toContainText('獺祭')

    // Flavor chart is present when the brand has a Sakenowa flavor_charts
    // row. Dassai (獺祭) always does in a mirrored corpus, but the
    // assertion is scoped to "if the section rendered, all six axes are
    // there" so a legitimate null-chart brand doesn't wedge this spec.
    // Testids come from the shared `FlavorChartInlineView` (same ones
    // the sake detail page uses).
    if (await page.getByTestId('brand-flavor-chart').isVisible()) {
      for (const axis of ['f1', 'f2', 'f3', 'f4', 'f5', 'f6']) {
        await expect(
          page.getByTestId(`flavor-axis-${axis}-bar`),
        ).toBeVisible()
      }
    }

    // The "See full details →" link points at the deep-dive page but is
    // NOT auto-followed — it's an explicit affordance.
    const openLink = page.getByTestId('scan-result-open-detail')
    await expect(openLink).toHaveAttribute(
      'href',
      new RegExp(`/en/sake/${dassaiBrandId}$`),
    )

    await context.close()
  })

  test('/de/scan upload skipped — coming-soon blocks the form in non-launched locale', async ({
    browser,
  }, testInfo) => {
    // The /de/ E2E parity coverage required by the slice spec is the
    // coming-soon assertion above (which IS the German-locale behavior
    // pre-launch). When DE flips into LAUNCHED_LOCALES (ADR-0008), this
    // becomes a real upload test in DE — for now we record the contract
    // as a skip with a clear reason.
    testInfo.skip(true, 'DE locale is pre-launch (ADR-0008); upload form does not render')
    void browser
  })

  test('/en/scan rate-limit — 6th scan in the same window shows the localized cap message', async ({
    browser,
  }, testInfo) => {
    // Phase 3 / S2 (#107): drive the form past the 5-call cap and verify
    // the localized rate-limit copy renders. Requires both DATABASE_URL
    // (so the matched sake page resolves on calls 1-5) AND the
    // rate-limit env triplet (so the action's enforceRateLimit() runs
    // against a real Upstash). CI without that wiring skips — the
    // anonymousRateLimit module's vitest suite covers the same shape
    // against an in-memory KV.
    testInfo.skip(
      dassaiBrandId === null,
      'DATABASE_URL not set or Dassai not in the Sakenowa mirror — DB-bound spec',
    )
    const hasRateLimitEnv =
      Boolean(process.env.SESSION_COOKIE_SECRET) &&
      Boolean(process.env.IP_HASH_SALT) &&
      Boolean(process.env.UPSTASH_REDIS_REST_URL) &&
      Boolean(process.env.UPSTASH_REDIS_REST_TOKEN)
    testInfo.skip(
      !hasRateLimitEnv,
      'Rate-limit env triplet not set (SESSION_COOKIE_SECRET / IP_HASH_SALT / UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN)',
    )

    const context = await browser.newContext({ locale: 'en-US' })
    await context.addCookies([AGE_GATE_COOKIE])
    const page = await context.newPage()

    // First 5 scans render the in-place result card (ADR-0015 — no more
    // auto-navigate). Reset each time so the file input can accept a
    // fresh pick.
    for (let i = 0; i < 5; i++) {
      await page.goto('/en/scan')
      await expect(page.getByTestId('scan-entry-page')).toBeVisible()
      await page.getByTestId('scan-file-input').setInputFiles(FIXTURE_IMAGE)
      await expect(page.getByTestId('scan-result-card')).toBeVisible()
    }

    // Sixth scan in the same 24h window — the rate-limited copy renders
    // in place of the matched result card.
    await page.goto('/en/scan')
    await expect(page.getByTestId('scan-entry-page')).toBeVisible()
    await page.getByTestId('scan-file-input').setInputFiles(FIXTURE_IMAGE)
    await expect(page.getByTestId('scan-error-rate-limited')).toBeVisible()
    // Page does not navigate away — the visitor stays on /en/scan.
    expect(page.url()).toMatch(/\/en\/scan$/)

    await context.close()
  })
})
