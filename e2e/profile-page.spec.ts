/**
 * E2E coverage for /[locale]/profile — the Taste Profile coming-soon
 * route (UX-D / #165).
 *
 * The route exists so:
 *   1. UX-A's header nav has a real destination for the "Taste Profile"
 *      item (no dead card / no /404).
 *   2. The sample radar mock is the Phase 5 design target — future work
 *      builds toward this shape.
 *
 * The mock is illustrative-data-only (no Sakenowa lookup), so there's no
 * `<SakenowaAttribution />` here (would misrepresent the source per
 * ADR-0005). The six axes DO use `<FlavorAxisLabel />` so the romaji +
 * kanji vocabulary convention is preserved (CLAUDE.md § "6-axis flavor
 * vocabulary"). Age-gate still applies — the mock renders flavor data
 * and is therefore gated content.
 */
import { expect, test } from '@playwright/test'
import { BASE_URL } from './_base-url'

const AGE_GATE_COOKIE = {
  name: 'yawaragi_age_gate',
  value: JSON.stringify({ v: 1, ts: Date.now() }),
  url: BASE_URL,
}

// Dismiss the cookie banner up-front (it's fixed to the viewport bottom
// and intercepts clicks on links near the bottom, e.g. the suggest CTA
// in the profile footer). Reject-all + accept-all both hide the banner.
const CONSENT_COOKIE = {
  name: 'yawaragi_consent',
  value: JSON.stringify({ version: 1, analytics: false, marketing: false }),
  url: BASE_URL,
}

test.describe('/en/profile — coming-soon route', () => {
  test('renders coming-soon badge + intro + sample radar mock when age-gate accepted', async ({
    browser,
  }) => {
    const context = await browser.newContext({ locale: 'en-US' })
    await context.addCookies([AGE_GATE_COOKIE, CONSENT_COOKIE])
    const page = await context.newPage()

    await page.goto('/en/profile')

    await expect(page.getByTestId('profile-page')).toBeVisible()
    await expect(page.getByTestId('profile-coming-soon-badge')).toBeVisible()
    // Radar mock renders with all six axis labels.
    const mock = page.getByTestId('taste-profile-mock')
    await expect(mock).toBeVisible()
    for (const axis of ['f1', 'f2', 'f3', 'f4', 'f5', 'f6'] as const) {
      await expect(page.getByTestId(`flavor-axis-${axis}-romaji`)).toBeVisible()
      // Kanji is always visible next to the romaji (project rule: never
      // render English-only labels for the six axes).
      await expect(page.getByTestId(`flavor-axis-${axis}-kanji`)).toBeVisible()
    }
    // The sample polygon is drawn (sanity — the SVG rendered its shape).
    await expect(page.getByTestId('taste-profile-sample-polygon')).toBeAttached()

    // "Where to explore next" bridges the visitor to the chat surface —
    // the closest thing until the real profile ships.
    const cta = page.getByTestId('profile-suggest-cta')
    await expect(cta).toBeVisible()
    await cta.click()
    await page.waitForURL(/\/en\/suggest/)

    await context.close()
  })

  test('shows the age gate when the cookie is absent', async ({ browser }) => {
    const context = await browser.newContext({ locale: 'en-US' })
    // NO age-gate cookie added.
    const page = await context.newPage()

    await page.goto('/en/profile')

    // The gate is a modal-ish component; assert its presence via testid.
    await expect(page.getByTestId('age-gate')).toBeVisible()
    // The profile content is NOT rendered.
    await expect(page.getByTestId('profile-page')).toHaveCount(0)

    await context.close()
  })

  test('/de/profile rewrites to the coming-soon landing (DE not launched)', async ({
    browser,
  }) => {
    // The proxy rewrites all gated paths on non-launched locales to the
    // coming-soon page (ADR-0008). Same posture as /de/suggest and /de/scan.
    const context = await browser.newContext({ locale: 'de-DE' })
    await context.addCookies([AGE_GATE_COOKIE, CONSENT_COOKIE])
    const page = await context.newPage()

    await page.goto('/de/profile')

    await expect(page.getByTestId('coming-soon')).toBeVisible()
    await expect(page.getByTestId('profile-page')).toHaveCount(0)

    await context.close()
  })
})
