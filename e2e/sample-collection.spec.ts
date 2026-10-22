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

  test('opens from the landing page too (design v1.8, L3)', async ({ page }) => {
    await page.goto(`${BASE_URL}/en`)
    await page.getByTestId('landing-sample-link').click()

    await expect(page).toHaveURL(/\/en\/collection$/)
    await expect(page.getByTestId('sample-collection-banner')).toContainText('A sample collection')
  })

  test('starting a scan leaves the sample first (design v1.8, L3)', async ({ page }) => {
    await page.goto(`${BASE_URL}/api/sample-collection?locale=en`)
    await expect(page.getByTestId('sample-collection-banner')).toBeVisible()
    await page.goto(`${BASE_URL}/en/scan`)
    await expect(page).toHaveURL(/\/en\/scan$/)
    await expect(page.getByTestId('scan-form')).toBeVisible()
    await expect(page.getByTestId('sample-collection-banner')).toHaveCount(0)
    // And it stays left: Collection is the visitor's own again.
    await page.goto(`${BASE_URL}/en/collection`)
    await expect(page.getByTestId('sample-collection-banner')).toHaveCount(0)
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
  test('opens "Your journal in numbers" from Palate, and a star bar opens the journal at those stars', async ({ page }) => {
    await page.goto(`${BASE_URL}/api/sample-collection?locale=en`)
    await page.goto(`${BASE_URL}/en/profile`)
    // v1.9 X1: a row at the end of Palate, to a screen of its own.
    await page.getByTestId('journal-numbers-row').click()
    await expect(page).toHaveURL(/\/en\/profile\/numbers$/)
    const numbers = page.getByTestId('journal-numbers')
    await expect(numbers.getByTestId('journal-numbers-tastings')).toContainText('tastings')
    await expect(page.getByTestId('prefecture-tile-map').locator('span')).toHaveCount(47)
    await expect(numbers).toContainText('Worked out from your own journal. Only you see it.')

    await numbers.getByRole('link', { name: /^5 stars: \d+$/ }).click()
    await expect(page).toHaveURL(/\/en\/collection\?.*stars=5/)
    await expect(page.getByTestId('journal-filter-summary')).toBeVisible()
  })

  test('narrows the journal by rating, says how many are left, searches it, and clears back to all', async ({ page }) => {
    await page.goto(`${BASE_URL}/api/sample-collection?locale=en`)
    await page.goto(`${BASE_URL}/en/collection?tab=journal`)
    const total = await page.getByTestId('journal-entry').count()

    // v1.9 W: a chip opens its values below the row; each value counts.
    await page.getByTestId('journal-filter-rating').click()
    const first = page.getByTestId('journal-filter-rating-option').first()
    const kept = Number(await first.locator('span').last().textContent())
    await first.click()

    await expect(page).toHaveURL(/[?&]stars=\d/)
    await expect(page.getByTestId('journal-entry')).toHaveCount(kept)
    await expect(page.getByTestId('journal-filter-summary')).toContainText(`${kept} of ${total} tastings`)

    // The search icon opens a field above the chips; it combines with them.
    await page.getByTestId('journal-search-toggle').click()
    await page.getByTestId('journal-search-input').fill('zzzz-no-such-word')
    await page.getByTestId('journal-search-input').press('Enter')
    await expect(page.getByTestId('journal-filter-none')).toContainText('No tastings match all of these')

    await page.getByTestId('journal-filter-clear').click()
    await expect(page.getByTestId('journal-entry')).toHaveCount(total)
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
