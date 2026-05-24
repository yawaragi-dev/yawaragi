import { expect, test, type BrowserContext } from '@playwright/test'

const AGE_GATE_COOKIE = {
  name: 'yawaragi_age_gate',
  value: JSON.stringify({ v: 1, ts: Date.now() }),
  url: 'http://localhost:3000',
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
        url: 'http://localhost:3000',
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
