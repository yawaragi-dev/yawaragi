/**
 * E2E coverage for the persistent global header (UX-A / #162).
 *
 * The header replaces the previous minimal `<header>{LocaleSwitcher}</header>`
 * with a wordmark + nav + locale switcher — visible on every `[locale]`
 * route. Two invariants the spec pins:
 *
 *   1. **Every advertised surface has a real destination.** The nav lists
 *      Scan, Chat, and Taste Profile; each link resolves to a live route
 *      (Chat → /suggest per issue #162; Profile → /profile per #165). No
 *      dead card, no `/chat` mock route.
 *   2. **Active-state indication tracks the pathname.** Landing on `/scan`
 *      marks the Scan nav item as `aria-current="page"`. This is the
 *      client-boundary reason `HeaderNav` reads `usePathname()`.
 *
 * DE locale is exercised for header PRESENCE only — under ADR-0008 the
 * German locale rewrites gated paths to coming-soon, so the nav
 * destinations aren't reachable there. When DE flips launched, extend
 * the DE tests to also assert nav destinations.
 */
import { expect, test } from '@playwright/test'
import { BASE_URL } from './_base-url'

const AGE_GATE_COOKIE = {
  name: 'yawaragi_age_gate',
  value: JSON.stringify({ v: 1, ts: Date.now() }),
  url: BASE_URL,
}

// Dismiss the cookie banner up-front. It's a fixed-bottom section that
// intercepts pointer events for links near the viewport bottom (the
// profile-page CTA specifically). Reject-all covers the same code path
// as accept-all for the banner-hidden invariant.
const CONSENT_COOKIE = {
  name: 'yawaragi_consent',
  value: JSON.stringify({ version: 1, analytics: false, marketing: false }),
  url: BASE_URL,
}

test.describe('site header — nav backbone', () => {
  test('renders on the /en landing with wordmark + three nav items + locale switcher', async ({
    browser,
  }) => {
    const context = await browser.newContext({ locale: 'en-US' })
    await context.addCookies([AGE_GATE_COOKIE, CONSENT_COOKIE])
    const page = await context.newPage()

    await page.goto('/en')

    const header = page.getByTestId('site-header')
    await expect(header).toBeVisible()
    await expect(header.getByTestId('header-wordmark')).toBeVisible()

    // Desktop-viewport spec (Playwright's default 1280x720) → the desktop
    // nav renders inline; mobile trigger stays hidden.
    const desktopNav = header.getByTestId('header-nav-desktop')
    await expect(desktopNav).toBeVisible()
    await expect(desktopNav.getByTestId('header-nav-scan')).toBeVisible()
    await expect(desktopNav.getByTestId('header-nav-chat')).toBeVisible()
    await expect(desktopNav.getByTestId('header-nav-profile')).toBeVisible()
    // Taste-profile item carries a "soon" badge (Phase 5 not shipped).
    await expect(desktopNav.getByTestId('header-nav-profile-badge')).toBeVisible()
    // Locale switcher relocated INTO the header.
    await expect(header.getByTestId('locale-switcher')).toBeVisible()

    await context.close()
  })

  test('wordmark link returns to the locale home', async ({ browser }) => {
    const context = await browser.newContext({ locale: 'en-US' })
    await context.addCookies([AGE_GATE_COOKIE, CONSENT_COOKIE])
    const page = await context.newPage()

    await page.goto('/en/scan')
    await page.getByTestId('header-wordmark').click()
    await page.waitForURL(/\/en\/?$/)

    await context.close()
  })

  test('Chat nav link resolves to /en/suggest (NOT a /chat mock)', async ({
    browser,
  }) => {
    const context = await browser.newContext({ locale: 'en-US' })
    await context.addCookies([AGE_GATE_COOKIE, CONSENT_COOKIE])
    const page = await context.newPage()

    await page.goto('/en')
    await page.getByTestId('header-nav-chat').click()
    await page.waitForURL(/\/en\/suggest/)
    // Landing view of the suggest surface renders.
    await expect(page.getByTestId('suggest-no-seed')).toBeVisible()

    await context.close()
  })

  test('active-state marks the current-surface nav item with aria-current="page"', async ({
    browser,
  }) => {
    const context = await browser.newContext({ locale: 'en-US' })
    await context.addCookies([AGE_GATE_COOKIE, CONSENT_COOKIE])
    const page = await context.newPage()

    await page.goto('/en/scan')
    // Scan link carries aria-current; others don't.
    await expect(page.getByTestId('header-nav-scan')).toHaveAttribute('aria-current', 'page')
    await expect(page.getByTestId('header-nav-chat')).not.toHaveAttribute('aria-current', 'page')

    await context.close()
  })

  test('mobile viewport collapses nav to a sheet menu', async ({ browser }) => {
    // iPhone-12-ish narrow viewport — inline nav hides, menu trigger
    // appears, opening the sheet reveals the same three nav items.
    const context = await browser.newContext({
      locale: 'en-US',
      viewport: { width: 390, height: 844 },
    })
    await context.addCookies([AGE_GATE_COOKIE, CONSENT_COOKIE])
    const page = await context.newPage()

    await page.goto('/en')

    const header = page.getByTestId('site-header')
    await expect(header.getByTestId('header-nav-desktop')).toBeHidden()

    const trigger = header.getByTestId('header-menu-trigger')
    await expect(trigger).toBeVisible()
    await trigger.click()

    // Sheet primitive (`@base-ui/react/dialog`) portals to `<body>` and
    // animates open over ~200ms with `data-starting-style:opacity-0`.
    // Assert the dialog role is present + visible first so the follow-
    // ing nav-item checks run AFTER the portal has mounted and the
    // fade-in has landed — otherwise a slow CI runner can miss the
    // 5s `toBeVisible` window on the nav element while the animation
    // is still transitioning opacity. Scoping the nav lookup to
    // `dialog` also protects against any accidental collision with a
    // desktop-nav testid that shares a prefix.
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()

    const mobileNav = dialog.getByTestId('header-nav-mobile')
    await expect(mobileNav).toBeVisible()
    await expect(mobileNav.getByTestId('header-nav-scan-mobile')).toBeVisible()
    await expect(mobileNav.getByTestId('header-nav-chat-mobile')).toBeVisible()
    await expect(mobileNav.getByTestId('header-nav-profile-mobile')).toBeVisible()

    await context.close()
  })

  test('/de landing still renders the header (locale switcher + wordmark)', async ({
    browser,
  }) => {
    // DE is not launched — the gated content rewrites to coming-soon, but
    // the header itself (which sits in the layout) still renders. This is
    // deliberate: the shell stays consistent across locales.
    const context = await browser.newContext({ locale: 'de-DE' })
    await context.addCookies([AGE_GATE_COOKIE, CONSENT_COOKIE])
    const page = await context.newPage()

    await page.goto('/de')

    await expect(page.getByTestId('site-header')).toBeVisible()
    await expect(page.getByTestId('header-wordmark')).toBeVisible()
    await expect(page.getByTestId('locale-switcher')).toBeVisible()

    await context.close()
  })
})

test.describe('landing cards — no dead cards', () => {
  test('all three landing cards (Scan, Chat, Profile) navigate to their live routes', async ({
    browser,
  }) => {
    const context = await browser.newContext({ locale: 'en-US' })
    await context.addCookies([AGE_GATE_COOKIE, CONSENT_COOKIE])
    const page = await context.newPage()

    await page.goto('/en')

    // Cards render.
    await expect(page.getByTestId('landing-scan-cta')).toBeVisible()
    await expect(page.getByTestId('landing-chat-cta')).toBeVisible()
    await expect(page.getByTestId('landing-profile-cta')).toBeVisible()

    // Chat card → /en/suggest.
    await page.getByTestId('landing-chat-cta').click()
    await page.waitForURL(/\/en\/suggest/)

    // Back, then Profile card → /en/profile.
    await page.goBack()
    await page.getByTestId('landing-profile-cta').click()
    await page.waitForURL(/\/en\/profile/)

    await context.close()
  })
})
