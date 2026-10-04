import { expect, test } from '@playwright/test'
import { BASE_URL } from './_base-url'

// The law line, not the hero: it is the string JMStV compliance actually
// rests on, so it is the one worth pinning. Design v1.4 §1.
const GATE_COPY_EN = 'Under German youth-protection law (JMStV)'
const GATE_COPY_DE = 'Jugendmedienschutz-Staatsvertrag'
// §0's heading — the landing copy that must be visible behind the gate,
// proving the gate is an overlay on a real page rather than a redirect.
const LANDING_BODY_EN = "Know what's in the cup."

test.describe('age gate enforcement', () => {
  test('a direct request to a gated path without the cookie shows the gate landing', async ({
    browser,
  }) => {
    const context = await browser.newContext({ locale: 'en-US' })
    const page = await context.newPage()

    await page.goto('/en/sake/anything')

    expect(page.url()).toMatch(/\/en\/sake\/anything$/)
    await expect(page.getByTestId('age-gate')).toBeVisible()
    await expect(page.getByText(GATE_COPY_EN)).toBeVisible()
    await expect(page.getByText(LANDING_BODY_EN)).toBeVisible()

    await context.close()
  })

  test('accepting the gate sets the cookie and stops the rewrite', async ({
    browser,
  }) => {
    const context = await browser.newContext({ locale: 'en-US' })
    const page = await context.newPage()

    await page.goto('/en/')
    await expect(page.getByTestId('age-gate')).toBeVisible()

    await page.getByTestId('age-gate-accept').click()
    await expect(page.getByTestId('age-gate')).toBeHidden()

    const cookies = await context.cookies()
    const gateCookie = cookies.find((c) => c.name === 'yawaragi_age_gate')
    expect(gateCookie).toBeDefined()
    expect(decodeURIComponent(gateCookie!.value)).toMatch(/"v":1/)

    const response = await page.goto('/en/sake/anything')
    expect(response?.status()).toBe(404)
    await expect(page.getByTestId('age-gate')).toBeHidden()

    await context.close()
  })

  test('accepting from a rewritten URL navigates to the original path', async ({
    browser,
  }) => {
    const context = await browser.newContext({ locale: 'en-US' })
    const page = await context.newPage()

    await page.goto('/en/sake/anything')
    await expect(page.getByTestId('age-gate')).toBeVisible()
    expect(page.url()).toMatch(/\/en\/sake\/anything$/)

    await page.getByTestId('age-gate-accept').click()
    await page.waitForURL(/\/en\/sake\/anything$/)
    await expect(page.getByTestId('age-gate')).toBeHidden()

    await context.close()
  })

  test('clearing the cookie re-prompts on the next visit', async ({
    browser,
  }) => {
    const context = await browser.newContext({ locale: 'en-US' })
    const page = await context.newPage()

    await page.goto('/en/')
    await page.getByTestId('age-gate-accept').click()
    await expect(page.getByTestId('age-gate')).toBeHidden()

    await context.clearCookies({ name: 'yawaragi_age_gate' })
    await page.goto('/en/')
    await expect(page.getByTestId('age-gate')).toBeVisible()

    await context.close()
  })

  test('declining the gate routes the visitor to /under-18', async ({
    browser,
  }) => {
    const context = await browser.newContext({ locale: 'en-US' })
    const page = await context.newPage()

    await page.goto('/en/')
    await page.getByTestId('age-gate-decline').click()
    await page.waitForURL(/\/en\/under-18$/)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

    const cookies = await context.cookies()
    expect(cookies.find((c) => c.name === 'yawaragi_age_gate')).toBeUndefined()

    await context.close()
  })

  test('a crawler User-Agent hitting a gated path sees the gate, not the gated content', async ({
    browser,
  }) => {
    const context = await browser.newContext({
      locale: 'en-US',
      userAgent:
        'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
    })
    const page = await context.newPage()

    await page.goto('/en/sake/anything')
    await expect(page.getByTestId('age-gate')).toBeVisible()

    await context.close()
  })

  test('/de/ shows coming-soon (not the gate) per ADR-0008', async ({
    browser,
  }) => {
    const context = await browser.newContext({ locale: 'de-DE' })
    const page = await context.newPage()

    await page.goto('/de/')
    await expect(page.getByTestId('coming-soon')).toBeVisible()
    await expect(page.getByTestId('age-gate')).toBeHidden()
    // Sake content from the EN landing must not leak through:
    await expect(page.getByText(GATE_COPY_DE)).toBeHidden()

    await context.close()
  })

  test('/de/sake/anything (gated rewrite) lands on coming-soon, not the gate', async ({
    browser,
  }) => {
    const context = await browser.newContext({ locale: 'de-DE' })
    const page = await context.newPage()

    await page.goto('/de/sake/anything')
    await expect(page.getByTestId('coming-soon')).toBeVisible()
    await expect(page.getByTestId('age-gate')).toBeHidden()

    await context.close()
  })

  test('/de/sake/foo with the gate cookie accepted ALSO lands on coming-soon', async ({
    browser,
  }) => {
    const context = await browser.newContext({ locale: 'de-DE' })
    await context.addCookies([
      {
        name: 'yawaragi_age_gate',
        value: JSON.stringify({ v: 1, ts: Date.now() }),
        url: BASE_URL,
      },
    ])
    const page = await context.newPage()

    const response = await page.goto('/de/sake/foo')
    expect(response?.status()).not.toBe(404)
    await expect(page.getByTestId('coming-soon')).toBeVisible()
    await expect(page.getByTestId('age-gate')).toBeHidden()

    await context.close()
  })
})

test.describe('age gate a11y', () => {
  test('dialog exposes role=dialog (base-ui uses inert instead of aria-modal)', async ({
    browser,
  }) => {
    const context = await browser.newContext({ locale: 'en-US' })
    const page = await context.newPage()

    await page.goto('/en/')

    const gate = page.getByTestId('age-gate')
    await expect(gate).toBeVisible()
    await expect(gate).toHaveAttribute('role', 'dialog')

    await context.close()
  })

  test('ESC does not dismiss the gate', async ({ browser }) => {
    const context = await browser.newContext({ locale: 'en-US' })
    const page = await context.newPage()

    await page.goto('/en/')
    await expect(page.getByTestId('age-gate')).toBeVisible()

    await page.keyboard.press('Escape')
    await expect(page.getByTestId('age-gate')).toBeVisible()

    await context.close()
  })

  test('popup z-index strictly exceeds overlay z-index (no backdrop-over-popup regression)', async ({
    browser,
  }) => {
    const context = await browser.newContext({ locale: 'en-US' })
    const page = await context.newPage()
    await page.goto('/en/')
    await page.getByTestId('age-gate').waitFor()

    const { overlayZ, popupZ } = await page.evaluate(() => {
      const overlay = document.querySelector(
        '[data-slot="dialog-overlay"]',
      ) as HTMLElement | null
      const popup = document.querySelector(
        '[data-slot="dialog-content"]',
      ) as HTMLElement | null
      return {
        overlayZ: overlay ? parseInt(getComputedStyle(overlay).zIndex, 10) : NaN,
        popupZ: popup ? parseInt(getComputedStyle(popup).zIndex, 10) : NaN,
      }
    })

    expect(Number.isFinite(overlayZ)).toBe(true)
    expect(Number.isFinite(popupZ)).toBe(true)
    expect(popupZ).toBeGreaterThan(overlayZ)

    await context.close()
  })
  test('before the gate can mount, nothing behind it is on screen', async ({ browser }) => {
    // The gate dialog lives in a portal, which mounts only after hydration.
    // The server HTML used to be the landing with no gate over it, so a fresh
    // visitor saw the page, sample flavor chart included, until JS arrived.
    // With JavaScript off, the page is frozen in exactly that pre-hydration
    // state: whatever is at the centre of the screen is what they saw.
    const context = await browser.newContext({ locale: 'en-US', javaScriptEnabled: false })
    const page = await context.newPage()
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/en/')

    const onTop = await page.evaluate(() => {
      const el = document.elementFromPoint(innerWidth / 2, innerHeight / 2)
      return el?.closest('[data-testid]')?.getAttribute('data-testid') ?? null
    })
    expect(onTop).toBe('age-gate-cover')

    await context.close()
  })

  test('accepting the gate leaves no cover behind', async ({ browser }) => {
    const context = await browser.newContext({ locale: 'en-US' })
    await context.addCookies([
      { name: 'yawaragi_age_gate', value: JSON.stringify({ v: 1, ts: Date.now() }), url: BASE_URL },
    ])
    const page = await context.newPage()
    await page.goto('/en/')
    await expect(page.getByTestId('age-gate-cover')).toHaveCount(0)
    await context.close()
  })
})
