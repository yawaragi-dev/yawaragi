import { expect, test, type BrowserContext } from '@playwright/test'
import { BASE_URL } from './_base-url'

const AGE_GATE_COOKIE = {
  name: 'yawaragi_age_gate',
  value: JSON.stringify({ v: 1, ts: Date.now() }),
  url: BASE_URL,
}

async function acceptAgeGateCookie(context: BrowserContext) {
  await context.addCookies([AGE_GATE_COOKIE])
}

test.describe('cookie banner — surface', () => {
  test('renders as role=region with aria-label on first visit', async ({
    browser,
  }) => {
    const context = await browser.newContext({ locale: 'en-US' })
    await acceptAgeGateCookie(context)
    const page = await context.newPage()
    await page.goto('/en/')

    const banner = page.getByTestId('cookie-banner')
    await expect(banner).toBeVisible()
    await expect(banner).toHaveAttribute('role', 'region')
    await expect(banner).toHaveAttribute('aria-label', /cookie/i)

    await context.close()
  })

  test('in the app, the bottom of a screen can still be scrolled clear of the banner', async ({
    browser,
  }) => {
    // §2: the banner does not block the app. A card that sits over the last
    // things on a screen, with no way to scroll them out from under it, does
    // block them — the Impressum among them.
    const context = await browser.newContext({ locale: 'en-US', viewport: { width: 390, height: 844 } })
    await acceptAgeGateCookie(context)
    const page = await context.newPage()
    await page.goto('/en/home')

    const banner = page.getByTestId('cookie-banner')
    await expect(banner).toBeVisible()
    // The banner publishes its height from an effect, after hydration; the
    // spacer is 0 until then. Scroll only once it is there.
    await expect
      .poll(() => page.evaluate(() => document.documentElement.style.getPropertyValue('--cookie-banner-h')))
      .not.toBe('')
    // The shell's scrolling pane is the outer <main>; screens may nest their own.
    await page.locator('main').first().evaluate((el) => el.scrollTo(0, el.scrollHeight))

    const footer = (await page.getByTestId('site-footer').boundingBox())!
    const card = (await banner.boundingBox())!
    expect(footer.y + footer.height).toBeLessThanOrEqual(card.y)

    await context.close()
  })

  test('also renders on /de/ coming-soon (GDPR is page-agnostic)', async ({
    browser,
  }) => {
    const context = await browser.newContext({ locale: 'de-DE' })
    const page = await context.newPage()
    await page.goto('/de/')

    await expect(page.getByTestId('cookie-banner')).toBeVisible()
    await expect(
      page.getByTestId('cookie-banner').getByText('Cookie-Einstellungen', {
        exact: false,
      }),
    ).toBeHidden()

    await context.close()
  })
})

test.describe('cookie banner — decisions', () => {
  test('Accept all sets analytics=true, marketing=true and hides the banner', async ({
    browser,
  }) => {
    const context = await browser.newContext({ locale: 'en-US' })
    await acceptAgeGateCookie(context)
    const page = await context.newPage()
    await page.goto('/en/')

    await page.getByTestId('cookie-banner-accept').click()
    await expect(page.getByTestId('cookie-banner')).toBeHidden()

    const cookies = await context.cookies()
    const consent = cookies.find((c) => c.name === 'yawaragi_consent')
    expect(consent).toBeDefined()
    const decoded = JSON.parse(decodeURIComponent(consent!.value))
    expect(decoded).toMatchObject({
      necessary: true,
      analytics: true,
      marketing: true,
      version: 1,
    })

    await context.close()
  })

  test('Reject non-essential sets both flags false and hides the banner', async ({
    browser,
  }) => {
    const context = await browser.newContext({ locale: 'en-US' })
    await acceptAgeGateCookie(context)
    const page = await context.newPage()
    await page.goto('/en/')

    await page.getByTestId('cookie-banner-reject').click()
    await expect(page.getByTestId('cookie-banner')).toBeHidden()

    const cookies = await context.cookies()
    const consent = cookies.find((c) => c.name === 'yawaragi_consent')
    const decoded = JSON.parse(decodeURIComponent(consent!.value))
    expect(decoded).toMatchObject({
      analytics: false,
      marketing: false,
    })

    await context.close()
  })

  test('Customize reveals per-category toggles; chosen state persists', async ({
    browser,
  }) => {
    const context = await browser.newContext({ locale: 'en-US' })
    await acceptAgeGateCookie(context)
    const page = await context.newPage()
    await page.goto('/en/')

    await page.getByTestId('cookie-banner-customize').click()

    const analytics = page.getByTestId('cookie-category-analytics')
    const marketing = page.getByTestId('cookie-category-marketing')
    await expect(analytics).toBeVisible()
    await expect(marketing).toBeVisible()

    await analytics.check()
    await marketing.uncheck()

    await page.getByTestId('cookie-banner-save').click()
    await expect(page.getByTestId('cookie-banner')).toBeHidden()

    const cookies = await context.cookies()
    const decoded = JSON.parse(
      decodeURIComponent(
        cookies.find((c) => c.name === 'yawaragi_consent')!.value,
      ),
    )
    expect(decoded).toMatchObject({ analytics: true, marketing: false })

    await context.close()
  })

  test('banner stays hidden on subsequent visits after a decision', async ({
    browser,
  }) => {
    const context = await browser.newContext({ locale: 'en-US' })
    await acceptAgeGateCookie(context)
    const page = await context.newPage()
    await page.goto('/en/')

    await page.getByTestId('cookie-banner-reject').click()
    await expect(page.getByTestId('cookie-banner')).toBeHidden()

    await page.goto('/en/')
    await expect(page.getByTestId('cookie-banner')).toBeHidden()

    await context.close()
  })

  test('a cookie with an older version causes the banner to re-appear (version-bump simulation)', async ({
    browser,
  }) => {
    const context = await browser.newContext({ locale: 'en-US' })
    await acceptAgeGateCookie(context)
    await context.addCookies([
      {
        name: 'yawaragi_consent',
        value: JSON.stringify({
          necessary: true,
          analytics: true,
          marketing: true,
          version: 0,
        }),
        url: BASE_URL,
      },
    ])
    const page = await context.newPage()
    await page.goto('/en/')

    await expect(page.getByTestId('cookie-banner')).toBeVisible()

    await context.close()
  })
})

test.describe('age-gate independence', () => {
  test('rejecting the cookie banner does not clear the age-gate cookie', async ({
    browser,
  }) => {
    const context = await browser.newContext({ locale: 'en-US' })
    await acceptAgeGateCookie(context)
    const page = await context.newPage()
    await page.goto('/en/')

    await page.getByTestId('cookie-banner-reject').click()
    await expect(page.getByTestId('cookie-banner')).toBeHidden()

    const cookies = await context.cookies()
    expect(
      cookies.find((c) => c.name === 'yawaragi_age_gate'),
    ).toBeDefined()
    await expect(page.getByTestId('age-gate')).toBeHidden()

    await context.close()
  })

  test('accepting the age gate does not silently accept analytics/marketing', async ({
    browser,
  }) => {
    const context = await browser.newContext({ locale: 'en-US' })
    const page = await context.newPage()
    await page.goto('/en/')

    await page.getByTestId('age-gate-accept').click()
    await expect(page.getByTestId('age-gate')).toBeHidden()

    const cookies = await context.cookies()
    expect(
      cookies.find((c) => c.name === 'yawaragi_consent'),
    ).toBeUndefined()
    await expect(page.getByTestId('cookie-banner')).toBeVisible()

    await context.close()
  })
})

test.describe('reopening preferences after a decision', () => {
  test('settings link reopens the banner pre-filled with the current decision', async ({
    browser,
  }) => {
    const context = await browser.newContext({ locale: 'en-US' })
    await acceptAgeGateCookie(context)
    const page = await context.newPage()
    await page.goto('/en/')

    // Make an initial decision: analytics on, marketing off.
    await page.getByTestId('cookie-banner-customize').click()
    await page.getByTestId('cookie-category-analytics').check()
    await page.getByTestId('cookie-banner-save').click()
    await expect(page.getByTestId('cookie-banner')).toBeHidden()

    // The settings link stays available; clicking it reopens the banner.
    await page.getByTestId('cookie-settings-link').click()
    await expect(page.getByTestId('cookie-banner')).toBeVisible()

    // The customize panel is open and pre-filled with the current decision.
    await expect(page.getByTestId('cookie-category-analytics')).toBeChecked()
    await expect(
      page.getByTestId('cookie-category-marketing'),
    ).not.toBeChecked()

    // Editing and saving updates the cookie.
    await page.getByTestId('cookie-category-analytics').uncheck()
    await page.getByTestId('cookie-category-marketing').check()
    await page.getByTestId('cookie-banner-save').click()
    await expect(page.getByTestId('cookie-banner')).toBeHidden()

    const cookies = await context.cookies()
    const decoded = JSON.parse(
      decodeURIComponent(
        cookies.find((c) => c.name === 'yawaragi_consent')!.value,
      ),
    )
    expect(decoded).toMatchObject({ analytics: false, marketing: true })

    await context.close()
  })

  test('withdrawal becomes reachable as soon as the gate is out of the way', async ({
    browser,
  }) => {
    // This used to assert the settings link was visible on the very first
    // visit. Design v1.4 §1 made the age gate a full-screen surface and §2
    // says the banner "appears AFTER the age gate, never with it" — so on a
    // first visit there is no consent yet to withdraw, and nothing to reach.
    //
    // What still has to hold, and what this now pins, is that withdrawal is
    // never further away than giving: the moment the gate is answered, the
    // settings link is on the page.
    const context = await browser.newContext({ locale: 'en-US' })
    const page = await context.newPage()

    await page.goto('/en/')
    await expect(page.getByTestId('age-gate')).toBeVisible()

    await page.getByTestId('age-gate-accept').click()
    await expect(page.getByTestId('age-gate')).toBeHidden()

    await expect(page.getByTestId('cookie-settings-link')).toBeVisible()
    await context.close()
  })
})

test.describe('functionality with non-essential rejected', () => {
  test('locale switcher still works after rejecting non-essential cookies', async ({
    browser,
  }) => {
    const context = await browser.newContext({ locale: 'en-US' })
    await acceptAgeGateCookie(context)
    const page = await context.newPage()
    await page.goto('/en/')

    await page.getByTestId('cookie-banner-reject').click()
    await expect(page.getByTestId('cookie-banner')).toBeHidden()

    await page
      .getByTestId('locale-switcher')
      .getByRole('button', { name: 'Deutsch' })
      .click()
    await page.waitForURL(/\/de\/?$/)
    await expect(page.getByTestId('coming-soon')).toBeVisible()

    await context.close()
  })
})
