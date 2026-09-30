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

  test('clips an over-wide child instead of letting the pane pan sideways', async ({
    browser,
  }) => {
    const { context, page } = await appPage(browser)
    await page.setViewportSize({ width: 390, height: 844 })

    await page.goto('/en/collection')

    // Rule 10's horizontal half, and the reason it needs its own pin:
    // `overflow-y: auto` alone computes `overflow-x` to `auto` (CSS turns a
    // `visible` axis into `auto` when the other axis is not visible). So the
    // moment the shell moved the scroll container off the document and onto
    // `<main>`, the pane became pannable — and the `overflow-x-clip` that
    // `[locale]/layout.tsx` carries on <html>/<body> no longer covered it,
    // because the scrolling box now sits INSIDE that defence. A popover near
    // the right edge is the realistic trigger: the provenance badge USED to
    // carry a `w-max max-w-xs` tooltip that overhung by ~72px on a 390px
    // screen (#313 replaced it with §16's sheet), and
    // `<HeuristicDisclaimer />` still carries one, clamped to 80vw.
    //
    // Asserted as "is the pane a horizontal scroll container", not as a
    // gesture or a `scrollWidth` reading: under overlay scrollbars a
    // synthetic wheel behaves the same on `auto` and `hidden`, and
    // `scrollWidth` reports the overhang either way. `hidden` and `clip` both
    // satisfy the rule, so an equivalent future fix keeps this green.
    const overflowX = await page
      .locator('main')
      .evaluate((pane) => getComputedStyle(pane).overflowX)

    expect(['hidden', 'clip']).toContain(overflowX)

    // And the document still must not gain a sideways scroll of its own.
    const docPans = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    )
    expect(docPans).toBe(false)

    await context.close()
  })

  test('renders at exactly the height the bottom-edge overlays clear', async ({
    browser,
  }) => {
    const { context, page } = await appPage(browser)
    await page.setViewportSize({ width: 390, height: 844 })

    await page.goto('/en/profile')

    // The bar sits in normal flow with no stacking context of its own, so a
    // `fixed bottom-6 z-40` overlay paints straight over the tabs. §2's cookie
    // banner and the journal's log button both offset by `--tab-bar-h` to
    // avoid that, which only holds while the bar really is that tall — so the
    // token and the rendered bar are pinned to each other here.
    const token = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--tab-bar-h'),
    )
    const barHeight = await page
      .getByTestId('tab-bar')
      .evaluate((el) => el.getBoundingClientRect().height)

    expect(Number.parseFloat(token)).toBeCloseTo(barHeight, 0)

    // And the overlays actually sit clear of it, which is the point.
    const bannerBottomOffset = await page.evaluate(() => {
      const probe = document.createElement('div')
      probe.style.cssText =
        'position:fixed;bottom:var(--tab-bar-h);height:1px;width:1px'
      document.body.append(probe)
      const top = probe.getBoundingClientRect().top
      probe.remove()
      return top
    })
    const barTop = await page
      .getByTestId('tab-bar')
      .evaluate((el) => el.getBoundingClientRect().top)
    expect(bannerBottomOffset).toBeLessThanOrEqual(barTop + 1)

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

    // §0's own header, not the app's: wordmark with the kanji, locale switch,
    // and one button into the product.
    await expect(page.getByTestId('landing-header')).toBeVisible()
    await expect(page.getByTestId('site-header')).toHaveCount(0)
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
