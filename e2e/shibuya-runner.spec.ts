import { expect, test } from '@playwright/test'
import { BASE_URL } from './_base-url'

const AGE_GATE_COOKIE = {
  name: 'yawaragi_age_gate',
  value: JSON.stringify({ v: 1, ts: Date.now() }),
  url: BASE_URL,
}

test.describe('shibuya runner on 404', () => {
  test('renders on /[locale]/[non-existent-path] with sound off by default', async ({
    browser,
  }) => {
    const context = await browser.newContext({ locale: 'en-US' })
    await context.addCookies([AGE_GATE_COOKIE])
    const page = await context.newPage()

    await page.goto('/en/this-path-does-not-exist')

    await expect(page.getByTestId('not-found')).toBeVisible()
    await expect(page.getByTestId('shibuya-runner')).toBeVisible()
    await expect(page.getByTestId('game-canvas-wrap')).toBeVisible()

    const soundToggle = page.getByTestId('game-sound-toggle')
    await expect(soundToggle).toBeVisible()
    await expect(soundToggle).toHaveAttribute('aria-pressed', 'false')

    await context.close()
  })

  test('starting the game ticks the distance counter', async ({ browser }) => {
    const context = await browser.newContext({ locale: 'en-US' })
    await context.addCookies([AGE_GATE_COOKIE])
    const page = await context.newPage()

    await page.goto('/en/missing')
    await page.getByTestId('shibuya-runner').waitFor()

    await page.keyboard.press('Space')
    // give the game loop a moment to accrue distance
    await page.waitForTimeout(600)

    const distance = await page.locator('text=Distance:').textContent()
    expect(distance).toBeTruthy()
    const value = parseInt(distance!.replace(/\D/g, ''), 10)
    expect(value).toBeGreaterThan(0)

    await context.close()
  })

  test('hides the game and shows opt-in when prefers-reduced-motion is set', async ({
    browser,
  }) => {
    const context = await browser.newContext({
      locale: 'en-US',
      reducedMotion: 'reduce',
    })
    await context.addCookies([AGE_GATE_COOKIE])
    const page = await context.newPage()

    await page.goto('/en/missing-reduced')
    await page.getByTestId('not-found').waitFor()

    // Canvas should not be there; the opt-in text should be.
    await expect(page.getByTestId('shibuya-runner')).toBeHidden()
    await expect(page.getByText('Show the game anyway')).toBeVisible()

    await context.close()
  })
})
