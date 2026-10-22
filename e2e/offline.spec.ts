import { expect, test } from '@playwright/test'
import { BASE_URL } from './_base-url'

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

  test('with no network, Collection shows the copy saved on the phone, read-only', async ({ page, context }) => {
    await context.addCookies(
      [
        ['yawaragi_age_gate', JSON.stringify({ v: 1, ts: Date.now() })],
        ['yawaragi_consent', JSON.stringify({ version: 1, analytics: false, marketing: false })],
        ['yawaragi_journal_stub', 'populated'],
      ].map(([name, value]) => ({ name: name!, value: value!, url: BASE_URL })),
    )

    await page.goto('/en/collection?tab=journal')
    await expect(page.getByTestId('journal-list')).toBeVisible()
    await page.evaluate(async () => {
      await navigator.serviceWorker.register('/sw.js', { scope: '/' })
      await navigator.serviceWorker.ready
    })
    // The copy is written after hydration; wait until it is there.
    await expect
      .poll(() => page.evaluate(() => localStorage.getItem('yawaragi-offline-copy')))
      .toBe('1')

    await context.setOffline(true)
    await page.goto('/en/collection').catch(() => {})

    await expect(page.getByTestId('offline-collection')).toBeVisible()
    await expect(page.getByTestId('offline-collection-note')).toContainText('nothing can be changed')
    await expect(page.getByTestId('offline-journal')).toContainText('Shintotsukawa')
    await expect(page.getByTestId('offline-collection-saved')).toContainText('Saved copy from')
  })
})
