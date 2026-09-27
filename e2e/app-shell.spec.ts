/**
 * E2E coverage for the app shell — design v1.4 § "App structure" and rule 11.
 *
 * Replaces the header-nav spec from #162. The nav backbone moved from the top
 * edge to the bottom edge, so the invariants that spec pinned have to be
 * re-pinned on their new owner rather than deleted:
 *
 *   1. **Every advertised surface has a real destination.** #162's rule, and
 *      the reason the shell does not ship two dead tabs: Home and Collection
 *      are routes that render a placeholder naming what will be there and a
 *      link somewhere useful. A tab that goes nowhere is the failure mode.
 *   2. **Active-state indication tracks the pathname.** Landing on `/scan`
 *      marks the Scan tab `aria-current="page"`. This is why `<TabBar />` is a
 *      client component.
 *   3. **The tab bar is absent outside the app shell** — rule 11 gives it to
 *      app screens, and the landing page is explicitly outside them.
 *   4. **Rule 10, the phone lock.** The shell is one viewport tall and the
 *      document does not scroll; only the inner pane does. This is the rule
 *      most likely to break silently when a screen is ported, because a page
 *      that over-scrolls looks fine on a desktop browser.
 *
 * The Impressum assertion is not decoration: German Impressumspflicht wants it
 * reachable from every page, and the app-side footer is the interim home until
 * §15 Account exists. If a future port drops it, this fails.
 */
import { expect, test } from '@playwright/test'
import { BASE_URL } from './_base-url'

const AGE_GATE_COOKIE = {
  name: 'yawaragi_age_gate',
  value: JSON.stringify({ v: 1, ts: Date.now() }),
  url: BASE_URL,
}

// The banner is fixed to the bottom edge and would sit over the tab bar,
// intercepting pointer events on the tabs. Reject-all exercises the same
// banner-hidden path as accept-all.
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

test.describe('app shell — tab bar', () => {
  test('shows all four tabs on an app screen, and the wordmark still leads out', async ({
    browser,
  }) => {
    const { context, page } = await appPage(browser)

    await page.goto('/en/scan')

    const tabBar = page.getByTestId('tab-bar')
    await expect(tabBar).toBeVisible()
    for (const [testId, label] of [
      ['tab-home', 'Home'],
      ['tab-scan', 'Scan'],
      ['tab-collection', 'Collection'],
      ['tab-palate', 'Palate'],
    ] as const) {
      await expect(tabBar.getByTestId(testId)).toContainText(label)
    }

    await expect(page.getByTestId('site-header').getByTestId('header-wordmark')).toBeVisible()

    await context.close()
  })

  test('marks the tab you are on, and only that one', async ({ browser }) => {
    const { context, page } = await appPage(browser)

    await page.goto('/en/scan')

    await expect(page.getByTestId('tab-scan')).toHaveAttribute('aria-current', 'page')
    for (const other of ['tab-home', 'tab-collection', 'tab-palate']) {
      await expect(page.getByTestId(other)).not.toHaveAttribute('aria-current', 'page')
    }

    await context.close()
  })

  test('every tab lands on a real screen — none is a dead link', async ({ browser }) => {
    const { context, page } = await appPage(browser)

    await page.goto('/en/scan')

    // Home and Collection are not built yet. #162's rule is that they are
    // still navigable and still say what they are, which is what makes
    // shipping the full four-tab bar honest rather than aspirational.
    await page.getByTestId('tab-home').click()
    await expect(page).toHaveURL(/\/en\/home$/)
    await expect(page.getByTestId('tab-placeholder')).toBeVisible()
    await expect(page.getByTestId('tab-placeholder-link')).toBeVisible()

    await page.getByTestId('tab-collection').click()
    await expect(page).toHaveURL(/\/en\/collection$/)
    await expect(page.getByTestId('tab-placeholder')).toBeVisible()

    await page.getByTestId('tab-palate').click()
    await expect(page).toHaveURL(/\/en\/profile$/)
    // The Palate tab points at a screen that IS built, so no placeholder.
    await expect(page.getByTestId('tab-placeholder')).toHaveCount(0)

    await context.close()
  })

  test('locks the app to one viewport — the document itself never scrolls', async ({
    browser,
  }) => {
    const { context, page } = await appPage(browser)
    await page.setViewportSize({ width: 390, height: 844 })

    await page.goto('/en/collection')

    const shell = page.getByTestId('app-shell')
    await expect(shell).toBeVisible()

    // Rule 10: `height: 100dvh; overflow: hidden` on the shell. If a port
    // reintroduces document flow, scrollHeight outgrows clientHeight here
    // long before it is visible to the eye on a desktop browser.
    const docScrolls = await page.evaluate(
      () => document.documentElement.scrollHeight > document.documentElement.clientHeight + 1,
    )
    expect(docScrolls).toBe(false)

    await context.close()
  })

  test('keeps the Impressum reachable from an app screen', async ({ browser }) => {
    const { context, page } = await appPage(browser)

    await page.goto('/en/scan')

    await expect(page.getByTestId('footer-imprint-link')).toBeVisible()
    await expect(page.getByTestId('footer-privacy-link')).toBeVisible()

    await context.close()
  })
})

test.describe('app shell — the landing page is outside it', () => {
  test('renders no tab bar on /en, per rule 11', async ({ browser }) => {
    const { context, page } = await appPage(browser)

    await page.goto('/en')

    await expect(page.getByTestId('site-header')).toBeVisible()
    // The landing is "a separate, normally scrolling page outside the app
    // shell" — giving it tabs would advertise an app the visitor has not
    // entered yet.
    await expect(page.getByTestId('tab-bar')).toHaveCount(0)
    await expect(page.getByTestId('app-shell')).toHaveCount(0)

    await context.close()
  })
})

// German is deliberately NOT covered here. ADR-0008 rewrites every gated
// German path to the coming-soon landing, which lives in `(site)` and so has
// no shell at all — there is no reachable German app screen to assert against
// until DE launches. The German tab labels are pinned in
// `tab-bar.test.tsx` instead, which renders the bar with the German
// catalogue directly.
