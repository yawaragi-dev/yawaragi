// Production smoke: key routes on a `next build` + `next start` server.
// Run by playwright.smoke.config.ts only (`pnpm build && pnpm test:smoke`);
// the dev-server config ignores this file.
//
// The point is the class of bug the dev server cannot show (#518: a route
// Next treats as static under a layout that reads cookies answers 500 in
// production only). So each route is checked for what a broken render loses:
// a status under 500 and a real heading, not the error page.
//
// No DATABASE_URL on CI: the sake page, which needs the catalogue, is
// skipped there, and nothing else here depends on it.
import { existsSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'

const CONSENT_COOKIE_VALUE = JSON.stringify({ version: 1, analytics: false, marketing: false })
const AGE_GATE_COOKIE_VALUE = JSON.stringify({ v: 1, ts: Date.now() })

async function load(page: Page, path: string) {
  const response = await page.goto(path)
  expect(response, `${path} answered`).not.toBeNull()
  expect(response!.status(), `${path} status`).toBeLessThan(500)
  return response!
}

async function expectHeading(page: Page, name: string | RegExp) {
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible()
}

test.describe('production build', () => {
  test.beforeEach(async ({ context, baseURL }) => {
    // The cookie banner would sit over the page; it is not what this checks.
    await context.addCookies([{ name: 'yawaragi_consent', value: CONSENT_COOKIE_VALUE, url: baseURL! }])
  })

  test('Learn: the index and its entries render without the age gate', async ({ page }) => {
    await load(page, '/en/learn')
    await expectHeading(page, 'Learn')

    for (const [slug, heading] of [
      ['how-to-read-a-label', /label/i],
      ['yeast-starters', 'Starters: sokujō, kimoto, yamahai'],
      ['region-niigata', /Niigata/],
    ] as const) {
      await load(page, `/en/learn/${slug}`)
      await expectHeading(page, heading)
    }

    const unknown = await page.goto('/en/learn/not-an-entry')
    expect(unknown!.status()).toBe(404)
  })

  test('the landing, the age gate and the app behind it', async ({ page }) => {
    await load(page, '/en')
    await expect(page.getByTestId('age-gate')).toBeVisible()
    await page.getByTestId('age-gate-accept').click()
    await expect(page.getByTestId('age-gate')).toBeHidden()
    // The hero's loop is drawn with a made-up bottle, so it needs no catalogue.
    await expect(page.getByTestId('landing-hero')).toBeVisible()
    await expect(page.getByTestId('landing-proof-repo')).toBeVisible()
    await page.getByTestId('landing-open-app').click()
    await expect(page).toHaveURL(/\/en\/home$/)
    await expect(page.getByTestId('home-page')).toBeVisible()
    await expect(page.getByTestId('tab-bar')).toBeVisible()

    await load(page, '/en/account/about')
    await expectHeading(page, 'About Yawaragi')

    await load(page, '/en/search')
    await expectHeading(page, /\S/)

    // Signed out: the tab still renders (its placeholder), never an error.
    await load(page, '/en/collection')
    await expectHeading(page, /\S/)
  })

  test('a sake page answers without a server error', async ({ context, page, baseURL }) => {
    // Without a database the page throws by design ("DATABASE_URL is not
    // set"), dev or production alike; CI has none. `next start` reads
    // .env.local itself, so locally it usually has one.
    test.skip(!process.env.DATABASE_URL && !existsSync('.env.local'), 'needs the catalogue (DATABASE_URL)')
    await context.addCookies([{ name: 'yawaragi_age_gate', value: AGE_GATE_COOKIE_VALUE, url: baseURL! }])
    await load(page, '/en/sake/1')
    test.skip((await page.getByTestId('sake-brand-page').count()) === 0, 'needs the catalogue (DATABASE_URL)')
    await expectHeading(page, /\S/)
  })

  test('the offline page is served as a self-contained document', async ({ request }) => {
    const response = await request.get('/api/offline/en')
    expect(response.status()).toBe(200)
    const html = await response.text()
    expect(html).toContain('<html lang="en">')
    expect(html).toContain('You’re offline')
  })
})
