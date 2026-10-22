// Design v1.9, rule 16 and S3: a tap is answered at once and held while the
// next screen is slow, with the words and a Cancel after 5 s; a line says
// when the phone is offline, and "Back online" when it returns.
import { expect, test } from '@playwright/test'
import { BASE_URL } from './_base-url'

test.beforeEach(async ({ context }) => {
  await context.addCookies(
    [
      ['yawaragi_age_gate', JSON.stringify({ v: 1, ts: Date.now() })],
      ['yawaragi_consent', JSON.stringify({ version: 1, analytics: false, marketing: false })],
    ].map(([name, value]) => ({ name: name!, value: value!, url: BASE_URL })),
  )
})

test('a slow tap stays pressed, shows the bar, then "Taking longer than usual" with Cancel', async ({ page }) => {
  await page.goto('/en/home')
  // Hydrated: before that a tap is a plain page load the browser answers.
  await expect(page.locator('html[data-nav-feedback="ready"]')).toHaveCount(1)
  // Hold the next screen's server response well past 5 s.
  await page.route(/\/en\/palate|\/en\/profile/, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 8_000))
    await route.continue().catch(() => {})
  })

  const tab = page.getByTestId('tab-palate')
  await tab.click()
  await expect(tab).toHaveAttribute('data-pressed', '')
  await expect(page.locator('[data-tab-pending]')).toHaveCount(1)
  await expect(page.getByTestId('nav-progress')).toBeVisible()
  await expect(page.getByTestId('nav-slow')).toContainText('Taking longer than usual', { timeout: 7_000 })

  await page.getByTestId('nav-slow-cancel').click()
  await expect(page.getByTestId('nav-slow')).toHaveCount(0)
  await expect(page.getByTestId('nav-progress')).toHaveCount(0)
  await expect(tab).not.toHaveAttribute('data-pressed', '')
  await expect(page).toHaveURL(/\/en\/home$/)
})

test('the offline line says so while the phone is offline, then "Back online"', async ({ page, context }) => {
  await page.goto('/en/home')
  await expect(page.getByTestId('tab-bar')).toBeVisible()

  await context.setOffline(true)
  await expect(page.getByTestId('offline-line')).toContainText('Offline · Saving and scanning need a connection.')

  await context.setOffline(false)
  await expect(page.getByTestId('offline-line')).toContainText('Back online')
  await expect(page.getByTestId('offline-line')).toHaveCount(0, { timeout: 5_000 })
})

test('with no connection a tap stays on the screen, shell and all, and says why', async ({ page, context }) => {
  await page.goto('/en/home')
  await expect(page.locator('html[data-nav-feedback="ready"]')).toHaveCount(1)

  await context.setOffline(true)
  await page.getByTestId('tab-collection').click()

  // Not the service worker's static page in place of the app (the bug: the
  // router fell back to a full page load, which lost the tab bar).
  await expect(page.getByTestId('nav-offline')).toContainText('No connection')
  await expect(page).toHaveURL(/\/en\/home$/)
  await expect(page.getByTestId('tab-bar')).toBeVisible()

  await context.setOffline(false)
  await page.getByTestId('tab-collection').click()
  await expect(page).toHaveURL(/\/en\/collection/)
  await expect(page.getByTestId('tab-bar')).toBeVisible()
})
