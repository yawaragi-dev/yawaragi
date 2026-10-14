// What an app screen shows when it cannot be drawn (#324): a sake's page is
// nothing without its catalogue row, so with the mirror out of reach it says
// so, offers to try again and a way home, instead of a 500.
//
// The inverse of the usual skip: this spec WANTS no database, so it runs on
// CI (which has no DATABASE_URL) and skips locally where the mirror is up.
import { expect, test } from '@playwright/test'
import { BASE_URL } from './_base-url'
import { findAnyBrandId } from './_db-fixtures'

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

let dbUp = false

test.beforeAll(async () => {
  dbUp = (await findAnyBrandId()) !== null
})

test('a sake page with the catalogue out of reach says so and offers to try again, not a 500', async ({
  browser,
}, testInfo) => {
  testInfo.skip(dbUp, 'The mirror is up — this spec is for the no-database case')
  const context = await browser.newContext()
  await context.addCookies([AGE_GATE_COOKIE, CONSENT_COOKIE])
  const page = await context.newPage()
  await page.goto('/en/sake/846')

  const error = page.getByTestId('app-error')
  await expect(error).toContainText('We couldn’t load this page')
  await expect(page.getByTestId('app-error-retry')).toHaveText('Try again')
  await expect(page.getByTestId('app-error-home')).toHaveAttribute('href', '/en/home')
  // Nothing of the catalogue is on screen, so Sakenowa is not credited (rule 15).
  await expect(page.locator('[data-footer-credit]')).toBeHidden()
  // The shell stays: the tab bar is still there to leave by.
  await expect(page.getByTestId('app-shell')).toBeVisible()
  await context.close()
})
