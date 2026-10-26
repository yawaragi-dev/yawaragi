// E2E coverage for the landing (§0) and its hero loop (design v1.8, K).
//
// The landing is an async RSC, so it is tested here, as a rendered page.
//
// 1. COMPLIANCE: the hero is a loop drawn with a made-up demo bottle, "Mihon
//    (見本)", so it is the same before and after the 18+ gate — and no
//    catalogue sake, Sakenowa chart or result card reaches the DOM before
//    acceptance (JMStV). No database is needed for any of it: the landing no
//    longer reads one.
// 2. REDUCED MOTION: K1's still frame is the Result frame, and nothing moves.
// 3. K4's proof row: three plain lines and the repository link.
import { expect, test } from '@playwright/test'
import { BASE_URL } from './_base-url'

const AGE_GATE_COOKIE = {
  name: 'yawaragi_age_gate',
  value: JSON.stringify({ v: 1, ts: Date.now() }),
  url: BASE_URL,
}

// The consent banner is fixed above the bottom edge, so it sits over anything
// low on the page. Specs that CLICK something down there decide the banner
// out of the way rather than relying on the viewport being tall enough — the
// same interception that bit the age gate.
const CONSENT_COOKIE = {
  name: 'yawaragi_consent',
  value: JSON.stringify({ version: 1, analytics: false, marketing: false }),
  url: BASE_URL,
}

const opacity = (el: Element) => getComputedStyle(el).opacity

test.describe('landing hero loop (design v1.8, K)', () => {
  test('before the gate: the demo loop sits behind the gate, and no catalogue data does', async ({
    browser,
  }) => {
    // Fresh context with NO age-gate cookie.
    const context = await browser.newContext({ locale: 'en-US' })
    const page = await context.newPage()
    await page.goto('/en')

    await expect(page.getByTestId('age-gate')).toBeVisible()
    // The loop is made up (見本 = "sample"), so it may be there…
    await expect(page.getByTestId('landing-hero')).toHaveCount(1)
    await expect(page.getByTestId('landing-loop-phone')).toContainText('見本')
    // …but no real sake's result card, chart or cross-beverage hook is.
    await expect(page.getByTestId('scan-result-card')).toHaveCount(0)
    await expect(page.getByTestId('brand-flavor-chart')).toHaveCount(0)
    await expect(page.getByTestId('scan-result-reverse-exemplar')).toHaveCount(0)

    await context.close()
  })

  test('after the gate: the loop plays scan → result → rate → palate, captioned outside the phone', async ({
    browser,
  }) => {
    const context = await browser.newContext({ locale: 'en-US', reducedMotion: 'no-preference' })
    await context.addCookies([AGE_GATE_COOKIE, CONSENT_COOKIE])
    const page = await context.newPage()
    await page.goto('/en')

    const hero = page.getByTestId('landing-hero')
    await expect(hero).toBeVisible()
    // The phone is a picture; the captions are its text, read in order.
    await expect(page.getByTestId('landing-loop-phone')).toHaveAttribute('aria-hidden', 'true')
    await expect(page.getByTestId('landing-loop-captions').locator('li')).toHaveText([
      'Point at the label.',
      'See what it is and how it tastes.',
      'One tap, and it’s in your journal.',
      'Your palate takes shape.',
    ])
    // It opens on the Scan frame.
    await expect(page.locator('[data-loop-frame="scan"]')).toHaveCSS('opacity', '1')

    // A visible way to stop it (WCAG 2.2.2), which holds the frame.
    const pause = page.getByTestId('landing-loop-pause')
    await expect(pause).toHaveAttribute('aria-pressed', 'false')
    await pause.click()
    await expect(pause).toHaveAttribute('aria-pressed', 'true')
    await expect(hero).toHaveAttribute('data-paused', '')
    const state = await page.locator('[data-loop-frame="scan"]').evaluate(
      (el) => el.getAnimations()[0]?.playState,
    )
    expect(state).toBe('paused')

    await context.close()
  })

  test('reduced motion: the Result frame, still, with nothing to pause', async ({ browser }) => {
    const context = await browser.newContext({ locale: 'en-US', reducedMotion: 'reduce' })
    await context.addCookies([AGE_GATE_COOKIE, CONSENT_COOKIE])
    const page = await context.newPage()
    await page.goto('/en')

    await expect(page.getByTestId('landing-hero')).toBeVisible()
    expect(await page.locator('[data-loop-frame="result"]').evaluate(opacity)).toBe('1')
    expect(await page.locator('[data-loop-frame="scan"]').evaluate(opacity)).toBe('0')
    expect(await page.locator('[data-loop-frame="palate"]').evaluate(opacity)).toBe('0')
    expect(await page.getByTestId('landing-loop-caption-result').evaluate(opacity)).toBe('1')
    // Nothing in the loop animates.
    const running = await page
      .getByTestId('landing-hero')
      .evaluate((el) => el.getAnimations({ subtree: true }).length)
    expect(running).toBe(0)
    await expect(page.getByTestId('landing-loop-pause')).toBeHidden()

    await context.close()
  })

  test('the proof row: three plain lines, ending with the repository', async ({ browser }) => {
    const context = await browser.newContext({ locale: 'en-US' })
    await context.addCookies([AGE_GATE_COOKIE, CONSENT_COOKIE])
    const page = await context.newPage()
    await page.goto('/en')

    const proof = page.getByTestId('landing-proof')
    await expect(proof).toContainText('Every value says where it came from')
    await expect(proof).toContainText('Tested against real label photos')
    await expect(proof).toContainText('Your journal stays private')
    // K4: no numbers.
    expect(await proof.innerText()).not.toMatch(/\d/)
    await expect(page.getByTestId('landing-proof-repo')).toHaveAttribute(
      'href',
      'https://github.com/yawaragi-dev/yawaragi',
    )

    await context.close()
  })

  test('the feature cards have an edge, not just a lift off the ground', async ({
    browser,
  }) => {
    const context = await browser.newContext({ locale: 'en-US' })
    await context.addCookies([AGE_GATE_COOKIE, CONSENT_COOKIE])
    const page = await context.newPage()

    await page.goto('/en')

    // Reported on sight, and the reason the icon looked loose on its own line:
    // the cards were ported without the prototype's `shadow-sm`, which on this
    // ground is a 1px hairline rather than a drop shadow. `bg-surface` alone is
    // a 9% lift off `bg-ground`, with nothing marking where the card ends.
    //
    // Asserted as "has a shadow at all" rather than the exact value: the hue is
    // still #308's question for the designers, and pinning `0 0 0 1px #302e2c`
    // would fail on an answer we asked for. Removing the class fails this.
    for (const testId of [
      'landing-feature-identify',
      'landing-feature-rate',
      'landing-feature-palate',
    ]) {
      const shadow = await page
        .getByTestId(testId)
        .evaluate((el) => getComputedStyle(el).boxShadow)
      expect(shadow, `${testId} should have an edge`).not.toBe('none')
    }

    await context.close()
  })

  // §0 aims both "Open the app" buttons at the app's front door, which is §3
  // Home. They pointed at `/scan` for three PRs while `/home` rendered
  // `<TabPlaceholder />`; §3 is ported now and they are back where §0 put
  // them. The rule pinned here is the outcome rather than the destination —
  // the landing's way into the app must reach something finished — which is
  // why this test did not need changing when the href did.
  //
  // One test per button rather than a loop inside one, so a failure names
  // which of the two broke instead of reporting the first one it reached.
  for (const testId of ['landing-open-app', 'landing-privacy-cta'] as const) {
    test(`"${testId}" lands on a built screen, not scaffolding`, async ({ browser }) => {
      const context = await browser.newContext({ locale: 'en-US' })
      await context.addCookies([AGE_GATE_COOKIE, CONSENT_COOKIE])
      const page = await context.newPage()

      await page.goto('/en')
      await page.getByTestId(testId).click()

      await expect(page.getByTestId('tab-bar')).toBeVisible()
      await expect(page.getByTestId('tab-placeholder')).toHaveCount(0)
      // And specifically the front door, now that there is one.
      await expect(page).toHaveURL(/\/en\/home$/)
      await expect(page.getByTestId('home-page')).toBeVisible()

      await context.close()
    })
  }

  test('the landing CTA routes into the scan flow', async ({ browser }) => {
    const context = await browser.newContext({ locale: 'en-US' })
    await context.addCookies([AGE_GATE_COOKIE])
    const page = await context.newPage()
    await page.goto('/en')

    // #166's AC is that the landing's CTA routes into the scan flow. The hero
    // used to carry a second "Scan your own →" button of its own; collapsing
    // the example into §0's right column left one route in, which is what §0
    // specifies.
    await page.getByTestId('landing-scan-cta').click()
    await expect(page).toHaveURL(/\/en\/scan$/)

    await context.close()
  })
})
