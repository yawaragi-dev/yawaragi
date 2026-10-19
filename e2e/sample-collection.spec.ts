/**
 * E2E coverage for the sample collection: a visitor without an account can
 * look through a journal, a cellar and a Palate with something in them, read
 * only, and leave again. Nothing here needs Clerk, Upstash or the database:
 * the sample is built in code, and a visitor who is not signed in is not the
 * maintainer.
 */
import { expect, test } from '@playwright/test'
import { BASE_URL } from './_base-url'

const AGE_GATE_COOKIE = {
  name: 'yawaragi_age_gate',
  value: JSON.stringify({ v: 1, ts: Date.now() }),
  url: BASE_URL,
}
const CONSENT_COOKIE = {
  name: 'yawaragi_consent',
  value: JSON.stringify({ version: 1, analytics: false, marketing: false }),
  url: BASE_URL,
}

test.describe('the sample collection', () => {
  test.beforeEach(async ({ context }) => {
    await context.addCookies([AGE_GATE_COOKIE, CONSENT_COOKIE])
  })

  test('opens from the empty Collection tab and lists a journal, marked as a sample', async ({ page }) => {
    await page.goto(`${BASE_URL}/en/collection`)
    await page.getByTestId('tab-placeholder-sample').click()

    await expect(page).toHaveURL(/\/en\/collection$/)
    await expect(page.getByTestId('sample-collection-banner')).toContainText('A sample collection')
    await expect(page.getByTestId('collection-page')).toContainText('Hanaabi')
  })

  test('shows the cellar with no way to change it', async ({ page }) => {
    await page.goto(`${BASE_URL}/api/sample-collection?locale=en`)
    await page.goto(`${BASE_URL}/en/collection?tab=cellar`)

    await expect(page.getByTestId('cellar-state').first()).toBeVisible()
    await expect(page.getByTestId('cellar-list').locator('button')).toHaveCount(0)
  })

  test('draws a Palate from the sample tastings', async ({ page }) => {
    await page.goto(`${BASE_URL}/api/sample-collection?locale=en`)
    await page.goto(`${BASE_URL}/en/profile`)

    await expect(page.getByTestId('sample-collection-banner')).toBeVisible()
    // Derived from the sample's ten tastings, not the anonymous cold start.
    await expect(page.getByText(/Derived from 10 tastings/)).toBeVisible()
  })

  test('Leave ends it: the Collection tab is empty again', async ({ page }) => {
    await page.goto(`${BASE_URL}/api/sample-collection?locale=en`)
    await page.getByTestId('sample-collection-leave').click()

    await expect(page).toHaveURL(/\/en\/home$/)
    await expect(page.getByTestId('sample-collection-banner')).toHaveCount(0)
    await page.goto(`${BASE_URL}/en/collection`)
    await expect(page.getByTestId('tab-placeholder')).toBeVisible()
  })
})

test.describe('what a bottling goes with', () => {
  test('a junmai ginjo bottling lists what fragrant sake is often served with, and where that comes from', async ({
    context,
    page,
  }) => {
    await context.addCookies([AGE_GATE_COOKIE, CONSENT_COOKIE])
    await page.goto(`${BASE_URL}/api/sample-collection?locale=en`)
    await page.goto(`${BASE_URL}/en/bottling/sample-jikon-omachi`)

    const section = page.getByTestId('bottle-pairings')
    await expect(section).toContainText('Goes with')
    await expect(section.getByTestId('pairing-food')).toHaveCount(3)
    await expect(section).toContainText('Sashimi and other raw fish')
    await expect(section.getByTestId('pairing-serve')).toContainText('花冷え')
    // The grade picked the row, not the line's chart.
    await expect(section.getByTestId('pairing-source-manual_curation')).toBeVisible()
    // v1.8 Q2: after the line block, as on the sake page.
    const following = await page
      .getByTestId('bottling-line-block')
      .evaluate((line) => {
        const pairings = document.querySelector('[data-testid="bottle-pairings"]')
        return pairings !== null && Boolean(line.compareDocumentPosition(pairings) & Node.DOCUMENT_POSITION_FOLLOWING)
      })
    expect(following).toBe(true)
  })
})
