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
