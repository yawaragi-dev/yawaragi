// E2E coverage for /[locale]/scan.
//
// Three scenarios:
//
// 1. /en/scan renders the entry CTA. Always runs — no DB dependency.
// 2. /de/scan renders the coming-soon page (ADR-0008 keeps the German
//    locale gated until the Impressum is in place). Always runs.
// 3. /en/scan → upload → matched Sake page. Requires DATABASE_URL in the
//    dev-server's environment AND a Sakenowa-published Dassai row whose
//    `name_kanji = '獺祭'` and brewery `name_kanji = '旭酒造'`. The S1
//    hardcoded extraction always resolves to that pair (see
//    src/lib/scan/scan-action.ts). CI runs without DATABASE_URL; the
//    Vitest+testcontainers integration test in
//    src/lib/sakenowa/lookup.integration.test.ts covers the read-side
//    contract.
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
  test('/en/scan renders the entry CTA pre-age-gate (discovery affordance)', async ({
    browser,
  }) => {
    const context = await browser.newContext({ locale: 'en-US' })
    // Deliberately no age-gate cookie — the entry CTA is allowed pre-gate.
    const page = await context.newPage()

    await page.goto('/en/scan')

    await expect(page.getByTestId('scan-entry-page')).toBeVisible()
    await expect(page.getByTestId('scan-pick-button')).toBeVisible()
    // The gate dialog overlays the page because the cookie is unset; the
    // CTA itself still renders behind it (no rewrite happened, which is
    // the point of the ungated entry route).
    await expect(page.getByTestId('age-gate')).toBeVisible()

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

  test('/en/scan upload → matched → auto-navigates to /en/sake/<brandId>', async ({
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

    // Wait for the route push to land us on the matched sake page.
    await page.waitForURL(new RegExp(`/en/sake/${dassaiBrandId}$`))
    await expect(page.getByTestId('sake-brand-page')).toBeVisible()

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

    // First 5 scans land on the matched sake page; reset between
    // submissions so each one starts at /en/scan.
    for (let i = 0; i < 5; i++) {
      await page.goto('/en/scan')
      await expect(page.getByTestId('scan-entry-page')).toBeVisible()
      await page.getByTestId('scan-file-input').setInputFiles(FIXTURE_IMAGE)
      await page.waitForURL(new RegExp(`/en/sake/${dassaiBrandId}$`))
    }

    // Sixth scan in the same 24h window — the rate-limited copy renders
    // in place of the matched navigation.
    await page.goto('/en/scan')
    await expect(page.getByTestId('scan-entry-page')).toBeVisible()
    await page.getByTestId('scan-file-input').setInputFiles(FIXTURE_IMAGE)
    await expect(page.getByTestId('scan-error-rate-limited')).toBeVisible()
    // Page does not navigate away — the visitor stays on /en/scan.
    expect(page.url()).toMatch(/\/en\/scan$/)

    await context.close()
  })
})
