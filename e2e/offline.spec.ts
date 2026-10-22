import { expect, test } from '@playwright/test'

// #480 slice 3: with no network, a page load shows Yawaragi's own offline
// page in the visitor's language instead of the browser's. The worker is
// registered by hand here because the app registers it in production builds
// only, and this suite runs against `pnpm dev`.
test.describe('offline page', () => {
  test('a page load with no network shows "You’re offline" with a way to try again', async ({ page, context }) => {
    await page.goto('/en/privacy')
    await page.evaluate(async () => {
      await navigator.serviceWorker.register('/sw.js', { scope: '/' })
      await navigator.serviceWorker.ready
    })

    await context.setOffline(true)
    await page.goto('/en/home').catch(() => {})

    await expect(page.getByTestId('offline-page')).toBeVisible()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('You’re offline')
    await expect(page.getByTestId('offline-retry')).toHaveText('Try again')
    expect(page.url()).toMatch(/\/en\/home$/)

    await page.goto('/de/home').catch(() => {})
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Du bist offline')

    // Back online, trying again lands on the page that was asked for.
    await context.setOffline(false)
    await page.getByTestId('offline-retry').click()
    await expect(page.getByTestId('offline-page')).toBeHidden()
    expect(page.url()).toMatch(/\/de\/home$/)
  })

  test('the offline page holds nothing but its own words', async ({ request }) => {
    const response = await request.get('/api/offline/de')
    expect(response.status()).toBe(200)
    const html = await response.text()
    expect(html).toContain('<html lang="de">')
    expect(html).toContain('Noch einmal versuchen')
    expect(html).not.toMatch(/<script|<link|src=/)
  })
})
