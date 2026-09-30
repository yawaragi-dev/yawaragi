// E2E coverage for §15 Account — the first slice.
//
// §15 makes one navigational promise in plain words: "From any tab: avatar →
// Impressum is 2 taps." That is not decoration — German Impressumspflicht
// (§5 TMG / §18 MStV) wants the Impressum "leicht erkennbar, unmittelbar
// erreichbar" from every page, and #303 left the app header with nothing but a
// wordmark. So the tap count is the spec here.
//
// The other pinned behaviour is the consent withdrawal path. ADR-0009 requires
// withdrawal to be "as easy as giving", and Account is where §15 puts it.
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

async function appPage(browser: import('@playwright/test').Browser) {
  const context = await browser.newContext({ locale: 'en-US' })
  await context.addCookies([AGE_GATE_COOKIE, CONSENT_COOKIE])
  return { context, page: await context.newPage() }
}

test.describe('§15 account', () => {
  test('Impressum is two taps from any tab', async ({ browser }) => {
    const { context, page } = await appPage(browser)

    // Tap one: the Account entry in the header, from a tab screen.
    await page.goto('/en/scan')
    await page.getByTestId('header-account-link').click()
    await expect(page).toHaveURL(/\/en\/account$/)

    // Tap two: the Impressum link on Account — `<LegalFooter />`'s, which is
    // the only copy of it on this screen now that §15's footer no longer
    // reprints the same three links.
    await page.getByTestId('footer-imprint-link').click()
    await expect(page).toHaveURL(/\/en\/imprint$/)
    await expect(page.getByTestId('imprint-page')).toBeVisible()

    await context.close()
  })

  test('the Account entry is on every tab screen', async ({ browser }) => {
    const { context, page } = await appPage(browser)

    for (const path of ['/en/home', '/en/scan', '/en/collection', '/en/profile']) {
      await page.goto(path)
      await expect(page.getByTestId('header-account-link')).toBeVisible()
    }

    await context.close()
  })

  test('cookie settings reopens the banner, so consent can be withdrawn here', async ({
    browser,
  }) => {
    const { context, page } = await appPage(browser)

    await page.goto('/en/account')
    // The banner is closed: the consent cookie above already records a
    // decision.
    await expect(page.getByTestId('cookie-banner')).toHaveCount(0)

    await page.getByTestId('account-cookie-settings').click()

    // Reopened, and in Customise — ADR-0009's "withdraw as easily as give"
    // means landing on the choices, not on a fresh accept/reject prompt.
    await expect(page.getByTestId('cookie-banner')).toBeVisible()
    await expect(page.getByTestId('cookie-banner-save')).toBeVisible()

    await context.close()
  })

  test('says plainly that a signed-out journal lives on this phone', async ({ browser }) => {
    const { context, page } = await appPage(browser)

    await page.goto('/en/account')

    // ADR-0020 keeps sign-up shut to everyone but maintainers, so signed out
    // is the designed default. The copy explains the trade rather than nagging.
    await expect(page.getByTestId('account-not-signed-in')).toBeVisible()
    await expect(page.getByTestId('account-sign-in-link')).toBeVisible()
    // And no sign-out control, which would be nonsense here.
    await expect(page.getByTestId('account-group-account')).toHaveCount(0)

    await context.close()
  })

  test('the Language row states the current language and does not pretend to switch', async ({
    browser,
  }) => {
    const { context, page } = await appPage(browser)

    await page.goto('/en/account')

    const row = page.getByTestId('account-language')
    await expect(row).toContainText('English')
    // §15: "not tappable until DACH launch". ADR-0008 gates the German app, so
    // a control here would lead to the coming-soon page, which is not a
    // language. Inert means no link and no button inside the row.
    await expect(row.getByRole('link')).toHaveCount(0)
    await expect(row.getByRole('button')).toHaveCount(0)

    await context.close()
  })

  test('prints the legal links exactly once', async ({ browser }) => {
    const { context, page } = await appPage(browser)

    // Self-review catch: §15's footer had reprinted `<LegalFooter />`'s three
    // links, and the first fix hid `<LegalFooter />` on this route — which
    // turned it into a client component, shipping the footer and its messages
    // to the browser on every app screen to answer one boolean. So §15's
    // footer contributes only the line it adds, and `<LegalFooter />` stays
    // the single home for the links here as everywhere.
    await page.goto('/en/account')
    await expect(page.getByTestId('site-footer')).toBeVisible()
    await expect(page.getByTestId('footer-imprint-link')).toHaveCount(1)
    await expect(page.getByTestId('footer-privacy-link')).toHaveCount(1)
    await expect(page.getByTestId('cookie-settings-link')).toHaveCount(1)

    // §15's row is one row. An earlier draft kept "Drink responsibly" on the
    // page while these links came from the layout, which produced two footers
    // — one left-aligned, one right, with a gap between. The line belongs to
    // the footer itself now, so Account has no footer of its own.
    await expect(page.getByTestId('account-footer')).toHaveCount(0)
    await expect(page.getByTestId('site-footer')).toContainText('Drink responsibly')

    // Still there everywhere else, which is the Impressumspflicht
    // reachability this slice deliberately does not trade away.
    await page.goto('/en/scan')
    await expect(page.getByTestId('site-footer')).toBeVisible()

    await context.close()
  })

  test('the Account entry says so when you are already on Account', async ({ browser }) => {
    const { context, page } = await appPage(browser)

    // A nav item, so it stays a link on its own route — unlike the wordmark,
    // whose whole job is to be an exit. What it must not do is claim to lead
    // somewhere else, which is what `aria-current` is for. `<TabBar />` marks
    // its active item the same way.
    await page.goto('/en/scan')
    await expect(page.getByTestId('header-account-link')).not.toHaveAttribute('aria-current')

    await page.goto('/en/account')
    await expect(page.getByTestId('header-account-link')).toHaveAttribute(
      'aria-current',
      'page',
    )

    await context.close()
  })

  test('locale is reachable in two taps, from the header until the row is real', async ({
    browser,
  }) => {
    const { context, page } = await appPage(browser)

    // ADR-0007's 2026-09-30 amendment replaced "a locale switcher lives in the
    // header" with "reachable in at most two taps from every screen", and made
    // §15's Language row its canonical home. Both controls exist today because
    // §15 marks the row "not tappable until DACH launch" and `de` is not in
    // `LAUNCHED_LOCALES` — so this pins the GUARANTEE rather than either
    // control, and keeps passing when the header switch goes.
    await page.goto('/en/scan')
    await page.getByTestId('header-account-link').click()
    await expect(page).toHaveURL(/\/en\/account$/)
    await expect(page.getByTestId('account-language')).toBeVisible()

    // Step 1 of the amendment's sequencing: the header still carries a working
    // switch, because the row above is not one yet. When `de` launches this
    // assertion inverts — `toHaveCount(0)` — and the two taps above stay.
    //
    // A first draft also asserted the row had no `href`, which was vacuous:
    // `<SettingsRow />` renders a `<div>`, so it can never have one. The row's
    // inertness is pinned properly one test above, by role.
    await expect(page.getByTestId('locale-switcher')).toBeVisible()
    await expect(page.getByTestId('locale-switcher').locator('[data-locale="de"]')).toBeEnabled()

    await context.close()
  })

  test('/de/account is rewritten to coming-soon (ADR-0008)', async ({ browser }) => {
    const context = await browser.newContext({ locale: 'de-DE' })
    await context.addCookies([AGE_GATE_COOKIE, CONSENT_COOKIE])
    const page = await context.newPage()

    await page.goto('/de/account')

    await expect(page.getByTestId('coming-soon')).toBeVisible()
    await expect(page.getByTestId('account-page')).toHaveCount(0)
    // Names WHICH coming-soon page. `/account` is gated, so the proxy rewrites
    // to `/de` and `(site)/page.tsx` serves it — this route no longer carries
    // its own unreachable copy, the way `/scan` did before #309.
    await expect(page.getByTestId('site-header')).toBeVisible()
    await expect(page).toHaveURL(/\/de\/account$/)

    await context.close()
  })
})
