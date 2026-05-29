import { expect, test } from '@playwright/test'
import { BASE_URL } from './_base-url'

test.describe('locale routing', () => {
  test('Accept-Language: de redirects / to /de/', async ({ browser }) => {
    const context = await browser.newContext({ locale: 'de-DE' })
    const page = await context.newPage()
    const response = await page.goto('/')
    expect(response?.url()).toMatch(/\/de\/?$/)
    await expect(page.locator('html')).toHaveAttribute('lang', 'de')
    await context.close()
  })

  test('Accept-Language: en redirects / to /en/', async ({ browser }) => {
    const context = await browser.newContext({ locale: 'en-US' })
    const page = await context.newPage()
    const response = await page.goto('/')
    expect(response?.url()).toMatch(/\/en\/?$/)
    await expect(page.locator('html')).toHaveAttribute('lang', 'en')
    await context.close()
  })

  test('NEXT_LOCALE=de cookie overrides Accept-Language: en', async ({
    browser,
  }) => {
    const context = await browser.newContext({ locale: 'en-US' })
    await context.addCookies([
      {
        name: 'NEXT_LOCALE',
        value: 'de',
        url: BASE_URL,
      },
    ])
    const page = await context.newPage()
    const response = await page.goto('/')
    expect(response?.url()).toMatch(/\/de\/?$/)
    await expect(page.locator('html')).toHaveAttribute('lang', 'de')
    await context.close()
  })

  test('direct /de/ renders German coming-soon regardless of Accept-Language', async ({
    browser,
  }) => {
    const context = await browser.newContext({ locale: 'en-US' })
    const page = await context.newPage()
    await page.goto('/de/')
    await expect(page.locator('html')).toHaveAttribute('lang', 'de')
    await expect(page.getByTestId('coming-soon')).toBeVisible()
    await expect(page.getByText('Bald verfügbar')).toBeVisible()
    await context.close()
  })

  test('direct /en/ renders English regardless of Accept-Language', async ({
    browser,
  }) => {
    const context = await browser.newContext({ locale: 'de-DE' })
    const page = await context.newPage()
    await page.goto('/en/')
    await expect(page.locator('html')).toHaveAttribute('lang', 'en')
    await expect(
      page.getByText('A companion for discovering sake.'),
    ).toBeVisible()
    await context.close()
  })
})

test.describe('locale switcher', () => {
  test('clicking Deutsch on /en/ navigates to /de/ and sets NEXT_LOCALE', async ({
    browser,
  }) => {
    const context = await browser.newContext({ locale: 'en-US' })
    await context.addCookies([
      {
        name: 'yawaragi_age_gate',
        value: JSON.stringify({ v: 1, ts: Date.now() }),
        url: BASE_URL,
      },
    ])
    const page = await context.newPage()
    await page.goto('/en/')

    await page
      .getByTestId('locale-switcher')
      .getByRole('button', { name: 'Deutsch' })
      .click()

    await page.waitForURL(/\/de\/?$/)
    await expect(page.locator('html')).toHaveAttribute('lang', 'de')

    const cookies = await context.cookies()
    const localeCookie = cookies.find((c) => c.name === 'NEXT_LOCALE')
    expect(localeCookie?.value).toBe('de')

    await context.close()
  })
})
