// E2E coverage for "About Yawaragi" (design v1.10, AA5–AA6): Account → Help →
// About, the page itself, and the build it names. An async server component,
// so its public interface is the rendered page.
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

// "{version} · build {7-char sha}" on a deployment, "· build dev" locally.
const VERSION = /^\d+\.\d+\.\d+ · build ([0-9a-f]{7}|dev)$/

async function appPage(browser: import('@playwright/test').Browser) {
  const context = await browser.newContext({ locale: 'en-US' })
  await context.addCookies([AGE_GATE_COOKIE, CONSENT_COOKIE])
  return { context, page: await context.newPage() }
}

test.describe('About Yawaragi', () => {
  test('opens from Account’s Help group, under the home-screen row', async ({ browser }) => {
    const { context, page } = await appPage(browser)

    await page.goto('/en/account')
    const help = page.getByTestId('account-group-help')
    await expect(help.getByTestId('account-home-screen')).toBeVisible()
    await help.getByTestId('account-about').click()

    await expect(page).toHaveURL(/\/en\/account\/about$/)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('About Yawaragi')

    await context.close()
  })

  test('says where the data comes from, how labels are read, and which build this is', async ({
    browser,
  }) => {
    const { context, page } = await appPage(browser)

    await page.goto('/en/account/about')
    await expect(page.getByTestId('about-page')).toBeVisible()

    await expect(page.getByTestId('about-sakenowa-link')).toHaveAttribute('href', 'https://sakenowa.com')
    await expect(page.getByTestId('about-data-sources')).toContainText('National Tax Agency of Japan')
    await page.getByTestId('about-learn-link').click()
    await expect(page).toHaveURL(/\/en\/learn$/)

    await page.goto('/en/account/about')
    // Kept photos are not built: the page must not promise a way to keep one.
    await expect(page.getByTestId('about-reading')).toContainText('discarded once read')
    await expect(page.getByTestId('about-reading')).not.toContainText('unless you keep it')
    await expect(page.getByTestId('about-source-code-link')).toHaveAttribute(
      'href',
      'https://github.com/yawaragi-dev/sakenowa-mcp',
    )
    await expect(page.getByTestId('about-version')).toHaveText(VERSION)

    // The end-of-screen block, with its Sakenowa line, as on every app screen.
    await expect(page.getByTestId('site-footer')).toContainText('Powered by Sakenowa')
    await expect(page.getByTestId('footer-imprint-link')).toHaveCount(1)
    // Feedback waits on open decision 20: nothing to send it with yet.
    await expect(page.getByText('Send feedback')).toHaveCount(0)

    await context.close()
  })

  test('Account’s footer starts with the same version, and only Account’s', async ({ browser }) => {
    const { context, page } = await appPage(browser)

    await page.goto('/en/account/about')
    const shown = await page.getByTestId('about-version').textContent()

    await page.goto('/en/account')
    await expect(page.getByTestId('footer-version')).toHaveText(`Yawaragi ${shown}`)

    await page.goto('/en/home')
    await expect(page.getByTestId('site-footer')).toBeVisible()
    await expect(page.getByTestId('footer-version')).toHaveCount(0)

    await context.close()
  })

  test('stays behind the 18+ confirmation', async ({ browser }) => {
    const context = await browser.newContext({ locale: 'en-US' })
    const page = await context.newPage()

    await page.goto('/en/account/about')
    await expect(page.getByTestId('age-gate')).toBeVisible()
    await expect(page.getByTestId('about-page')).toHaveCount(0)

    await context.close()
  })
})
