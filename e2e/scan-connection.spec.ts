// A scan sent with no connection (design v1.9 S4, S5): the camera keeps the
// photo with "Send again", instead of ending on the app's error page with the
// photo gone; a slow one says so after 10 s with Cancel. Needs no catalogue: the photo never
// reaches the server while the browser is offline, and the retry is only
// checked for leaving the no-connection screen, whatever it then finds.
import { expect, test } from '@playwright/test'
import { BASE_URL } from './_base-url'

const AGE_GATE_COOKIE = {
  name: 'yawaragi_age_gate',
  value: JSON.stringify({ v: 1, ts: Date.now() }),
  url: BASE_URL,
}

test('a scan with no connection keeps the photo on the camera, says so again, and offers it once the connection is back', async ({ browser }) => {
  const context = await browser.newContext({ locale: 'en-US' })
  await context.addCookies([AGE_GATE_COOKIE])
  const page = await context.newPage()
  await page.goto(`${BASE_URL}/en/scan`)
  await expect(page.locator('input[type=file]').first()).toBeAttached()

  await context.setOffline(true)
  await page.locator('input[type=file]').first().setInputFiles('e2e/fixtures/dassai-label.jpg')

  // Design v1.9 S5 (114): on the camera, with the photo in the frame.
  const failed = page.getByTestId('scan-error-offline')
  await expect(failed).toHaveText('No connection')
  await expect(page.getByText('It wasn’t sent, so it doesn’t use a scan.')).toBeVisible()
  await expect(page.getByTestId('scan-camera-still')).toBeVisible()
  await expect(page.getByTestId('app-error')).toHaveCount(0)

  await page.getByTestId('scan-send-again').click()
  await expect(page.getByText('Still no connection.')).toBeVisible()

  await context.setOffline(false)
  await expect(failed).toHaveText('Connection is back')
  await expect(page.getByTestId('scan-send-again')).toHaveText('Send now')
  await page.getByTestId('scan-send-again').click()
  await expect(failed).toHaveCount(0)
  await expect(page.getByTestId('app-error')).toHaveCount(0)
  await context.close()
})

test('a scan that is slow says so after 10 s, and Cancel keeps the photo to send again', async ({ browser }) => {
  const context = await browser.newContext({ locale: 'en-US' })
  await context.addCookies([AGE_GATE_COOKIE])
  const page = await context.newPage()
  await page.goto(`${BASE_URL}/en/scan`)
  await expect(page.locator('input[type=file]').first()).toBeAttached()
  // Hold the scan's Server Action call past the 10 s mark.
  await page.route(`${BASE_URL}/en/scan`, async (route) => {
    if (route.request().method() !== 'POST') return route.continue()
    await new Promise((resolve) => setTimeout(resolve, 14_000))
    await route.continue().catch(() => {})
  })
  await page.locator('input[type=file]').first().setInputFiles('e2e/fixtures/dassai-label.jpg')

  await expect(page.getByTestId('scan-camera-slow')).toHaveText('Taking longer than usual', { timeout: 13_000 })
  await expect(page.getByText('If it arrived, it counts as one scan.')).toBeVisible()
  await page.getByTestId('scan-camera-cancel').click()

  await expect(page.getByTestId('scan-error-timed-out')).toBeVisible()
  await expect(page.getByTestId('scan-camera-still')).toBeVisible()
  await expect(page.getByTestId('scan-send-again')).toBeVisible()
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

  // Design v1.9 S6 (116): the stars stay where tapped, "Not saved", and Try
  // again, not the error page that used to take the whole sake page down.
  await expect(page.getByTestId('tasting-log-rating')).toHaveText('4.0 · Not saved')
  await expect(page.getByTestId('tasting-log-not-saved')).toContainText('No connection, so this isn’t in your journal yet.')
  await page.getByTestId('tasting-log-try-again').click()
  await expect(page.getByTestId('tasting-log-not-saved')).toContainText('Still no connection.')
  await expect(page.getByTestId('app-error')).toHaveCount(0)
  await expect(page.getByTestId('sake-brand-page')).toBeVisible()
  await context.close()
})
