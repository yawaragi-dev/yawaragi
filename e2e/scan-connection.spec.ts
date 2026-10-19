// A scan sent with no connection (design question S, #464): the scan stays
// on its own screen with the photo and "Send again", instead of ending on the
// app's error page with the photo gone. Needs no catalogue: the photo never
// reaches the server while the browser is offline, and the retry is only
// checked for leaving the no-connection screen, whatever it then finds.
import { expect, test } from '@playwright/test'
import { BASE_URL } from './_base-url'

const AGE_GATE_COOKIE = {
  name: 'yawaragi_age_gate',
  value: JSON.stringify({ v: 1, ts: Date.now() }),
  url: BASE_URL,
}

test('a scan with no connection keeps the photo and can be sent again', async ({ browser }) => {
  const context = await browser.newContext({ locale: 'en-US' })
  await context.addCookies([AGE_GATE_COOKIE])
  const page = await context.newPage()
  await page.goto(`${BASE_URL}/en/scan`)
  await expect(page.locator('input[type=file]').first()).toBeAttached()

  await context.setOffline(true)
  await page.locator('input[type=file]').first().setInputFiles('e2e/fixtures/dassai-label.jpg')

  const failed = page.getByTestId('scan-error-offline')
  await expect(failed).toBeVisible()
  await expect(failed).toContainText('No connection')
  await expect(page.getByTestId('scan-outcome-photo')).toBeVisible()
  await expect(page.getByTestId('app-error')).toHaveCount(0)

  await context.setOffline(false)
  await page.getByTestId('scan-send-again').click()
  await expect(failed).toHaveCount(0)
  await expect(page.getByTestId('app-error')).toHaveCount(0)
  await context.close()
})

test('a rating tapped with no connection says it was not saved, and the page stays', async ({ browser }) => {
  const context = await browser.newContext({ locale: 'en-US' })
  await context.addCookies([AGE_GATE_COOKIE, { name: 'yawaragi_journal_stub', value: 'empty', url: BASE_URL }])
  const page = await context.newPage()
  await page.goto(`${BASE_URL}/en/sake/1?rate=1`)
  test.skip((await page.getByTestId('sake-brand-page').count()) === 0, 'DB-bound spec')
  await expect(page.getByTestId('tasting-log-panel')).toBeVisible()

  await context.setOffline(true)
  await page.getByTestId('star-rating-4').click()

  // The panel's own "couldn't save", not the error page that used to take
  // the whole sake page down (design question S6).
  await expect(page.getByTestId('tasting-log-error')).toBeVisible()
  await expect(page.getByTestId('app-error')).toHaveCount(0)
  await expect(page.getByTestId('sake-brand-page')).toBeVisible()
  await context.close()
})
