// E2E coverage for /[locale]/scan.
//
// Post-ADR-0015 / #163:
//
// 1. /en/scan is FULLY age-gated (was ungated pre-#163 as a discovery
//    affordance). Without the gate cookie, the proxy rewrites to the
//    landing gate.
// 2. /de/scan renders the coming-soon page (ADR-0008 keeps the German
//    locale gated until the Impressum is in place). Always runs.
// 3. /en/scan → upload → matched result renders IN PLACE (no more auto-
//    navigate to /sake/[brandId]). The rich result card shows the
//    visitor's photo, the sake kanji + romaji, the flavor chart, and a
//    "Full bottle page" row back to the deep-dive page. Requires
//    DATABASE_URL + a Sakenowa-published Dassai row; the vision provider
//    is `e2e-stub` under Playwright.
import { expect, test } from '@playwright/test'
import { BASE_URL } from './_base-url'
import { findScanS1FixtureBrandId } from './_db-fixtures'

const AGE_GATE_COOKIE = {
  name: 'yawaragi_age_gate',
  value: JSON.stringify({ v: 1, ts: Date.now() }),
  url: BASE_URL,
}

const FIXTURE_IMAGE = 'e2e/fixtures/dassai-label.jpg'

let dassaiBrandId: number | null = null

test.beforeAll(async () => {
  dassaiBrandId = await findScanS1FixtureBrandId()
})

test.describe('scan entry route', () => {
  test('/en/scan is gated — no cookie → landing gate rewrite (ADR-0015)', async ({
    browser,
  }) => {
    const context = await browser.newContext({ locale: 'en-US' })
    // Deliberately no age-gate cookie. Post-ADR-0015 the whole /scan
    // route is gated, so the proxy rewrites to the landing gate — the
    // scan form (and its localized entry copy) must not render.
    const page = await context.newPage()

    await page.goto('/en/scan')

    // The rewrite lands us on the landing page rendered under the /scan
    // URL. The gate dialog is present; the scan form is not.
    await expect(page.getByTestId('age-gate')).toBeVisible()
    await expect(page.getByTestId('scan-entry-page')).toHaveCount(0)
    await expect(page.getByTestId('scan-camera')).toHaveCount(0)

    await context.close()
  })

  test('/en/scan renders the camera when the gate cookie is set', async ({
    browser,
  }) => {
    const context = await browser.newContext({ locale: 'en-US' })
    await context.addCookies([AGE_GATE_COOKIE])
    const page = await context.newPage()

    await page.goto('/en/scan')

    await expect(page.getByTestId('scan-entry-page')).toBeVisible()
    // §4: the Scan tab's screen IS the viewfinder. Which state it settles on
    // depends on the machine — a laptop with a camera and no permission gets
    // "Camera is off", a CI container with no video device gets "No camera
    // here" — so this asserts the screen's container and its title, which
    // hold in every case. The screen renders, and it renders a state with a
    // way forward whatever the hardware is. The two failure panels get their
    // own specs below, each forcing its cause rather than hoping for it.
    const camera = page.getByTestId('scan-camera')
    await expect(camera).toBeVisible()
    await expect(camera.getByText('Scan a label')).toBeVisible()
    // The gate dialog does NOT render — we already accepted.
    await expect(page.getByTestId('age-gate')).toHaveCount(0)

    await context.close()
  })

  test('a refused camera still leaves a way to finish the scan', async ({ browser }) => {
    // A phone: touch is the primary input. A desktop never asks for the camera
    // at all (next spec), so there would be nothing to refuse.
    const context = await browser.newContext({
      locale: 'en-US',
      viewport: { width: 390, height: 844 },
      hasTouch: true,
      isMobile: true,
    })
    await context.addCookies([AGE_GATE_COOKIE])
    const page = await context.newPage()

    // The rejection is stubbed, not left to the browser. Locally a refused
    // camera raises NotAllowedError because the machine HAS a camera and no
    // permission; on CI the container has no video device at all, so the same
    // page settles on "No camera here" instead — the spec passed on a laptop
    // and failed in Actions for a reason that had nothing to do with the code.
    //
    // Stubbing the error names the case directly: this is the panel a visitor
    // who said no must get, whatever hardware is underneath.
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'mediaDevices', {
        configurable: true,
        value: {
          getUserMedia: () =>
            Promise.reject(Object.assign(new Error('denied'), { name: 'NotAllowedError' })),
        },
      })
    })
    await page.goto('/en/scan')

    const denied = page.getByTestId('scan-camera-denied')
    await expect(denied).toBeVisible()
    // Discovery framing, not error tone: "Camera is off", never "Camera error".
    await expect(denied).toContainText('Camera is off')
    // They can change their mind...
    await expect(page.getByTestId('scan-camera-allow')).toBeVisible()

    // ...but the photo path is the one that definitely works, and ADR-0012
    // requires it stay reachable: "a build where the OS picker is unreachable
    // violates this ADR". Proven by the file chooser actually opening, not by
    // the button merely existing.
    const [chooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.getByTestId('scan-camera-choose-photo').click(),
    ])
    expect(chooser).toBeTruthy()

    await context.close()
  })

  test('a desktop goes straight to "add a photo", without asking for its webcam', async ({
    browser,
  }) => {
    const context = await browser.newContext({ locale: 'en-US' })
    await context.addCookies([AGE_GATE_COOKIE])
    const page = await context.newPage()
    await page.setViewportSize({ width: 1280, height: 800 })

    // The webcam exists and would say yes. Nobody scans a label by holding a
    // bottle up to a laptop, so the permission prompt is a cost with no
    // payoff: the page must not even call getUserMedia.
    await page.addInitScript(() => {
      ;(window as unknown as { __gumCalls: number }).__gumCalls = 0
      Object.defineProperty(navigator, 'mediaDevices', {
        configurable: true,
        value: {
          getUserMedia: () => {
            ;(window as unknown as { __gumCalls: number }).__gumCalls++
            return Promise.reject(new Error('should not be called'))
          },
        },
      })
    })
    await page.goto('/en/scan')

    await expect(page.getByTestId('scan-camera-unavailable')).toBeVisible()
    await expect(page.getByTestId('scan-camera-shutter')).toHaveCount(0)
    expect(
      await page.evaluate(() => (window as unknown as { __gumCalls: number }).__gumCalls),
    ).toBe(0)

    const [chooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.getByTestId('scan-camera-drop-zone').click(),
    ])
    expect(chooser).toBeTruthy()

    await context.close()
  })

  test('a browser with no camera at all gets the drop zone, not a permission prompt', async ({
    browser,
  }) => {
    const context = await browser.newContext({ locale: 'en-US' })
    await context.addCookies([AGE_GATE_COOKIE])
    const page = await context.newPage()
    await page.setViewportSize({ width: 390, height: 844 })

    // Screenshot 08. A browser without `mediaDevices` must land on the panel
    // that offers a file instead of the one that offers a permission. Paired
    // with the spec above, the two prove the routing in `classifyCameraError`
    // end to end: the same screen, two causes, two different first actions.
    //
    // What this asserts is the visible outcome. That the feature detect
    // answers BEFORE any prompt is raised — so nobody gets a dialog about a
    // device they do not have — is `canUseLiveCamera`'s own contract and is
    // pinned in `camera.test.ts`; verified here that mutating the detect to
    // `return true` does NOT fail this spec, because the subsequent throw
    // lands on the same panel. Two tests, two properties.
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'mediaDevices', {
        value: undefined,
        configurable: true,
      })
    })
    await page.goto('/en/scan')

    const unavailable = page.getByTestId('scan-camera-unavailable')
    await expect(unavailable).toBeVisible()
    await expect(unavailable).toContainText('No camera here')
    // And NOT the other panel — routing a missing device to "Camera is off"
    // would tell this visitor to grant a permission that changes nothing.
    await expect(page.getByTestId('scan-camera-denied')).toHaveCount(0)
    await expect(page.getByTestId('scan-camera-allow')).toHaveCount(0)

    const [chooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.getByTestId('scan-camera-drop-zone').click(),
    ])
    expect(chooser).toBeTruthy()

    await context.close()
  })

  test('/de/scan is rewritten to the coming-soon page (DE locale gated, ADR-0008)', async ({
    browser,
  }) => {
    const context = await browser.newContext({ locale: 'de-DE' })
    await context.addCookies([AGE_GATE_COOKIE])
    const page = await context.newPage()

    await page.goto('/de/scan')

    await expect(page.getByTestId('coming-soon')).toBeVisible()
    await expect(page.getByTestId('scan-entry-page')).toHaveCount(0)
    // Names WHICH coming-soon page this is. `/scan` is a gated path, so the
    // proxy rewrites to `/de` and `(site)/page.tsx` serves it — the scan
    // route no longer carries its own copy. Both used to answer to
    // `data-testid="coming-soon"`, so this assertion was ambiguous and would
    // have passed either way; `site-footer` belongs only to the `(site)` one.
    await expect(page.getByTestId('site-footer')).toBeVisible()
    // Still `/de/scan` in the address bar — a rewrite, not a redirect.
    await expect(page).toHaveURL(/\/de\/scan$/)

    await context.close()
  })

  test('/en/scan upload → matched → renders result card in place (ADR-0015)', async ({
    browser,
  }, testInfo) => {
    testInfo.skip(
      dassaiBrandId === null,
      'DATABASE_URL not set or Dassai (獺祭 / 旭酒造) not in the Sakenowa mirror — DB-bound spec',
    )

    const context = await browser.newContext({ locale: 'en-US' })
    await context.addCookies([AGE_GATE_COOKIE])
    const page = await context.newPage()

    await page.goto('/en/scan')
    await expect(page.getByTestId('scan-entry-page')).toBeVisible()

    // The file input is `sr-only`, so set the file directly on it rather
    // than driving the OS file picker dialog (which Playwright won't
    // open here). Picking a file fires the change handler the same way.
    await page.getByTestId('scan-file-input').setInputFiles(FIXTURE_IMAGE)

    // Post-ADR-0015: the result renders IN PLACE. We stay on /en/scan.
    await expect(page.getByTestId('scan-result-card')).toBeVisible()
    expect(page.url()).toMatch(/\/en\/scan$/)

    // The card carries the visitor's own photo preview (blob: URL —
    // client-only object URL, never uploaded/persisted).
    const photoSrc = await page.getByTestId('scan-result-photo').getAttribute('src')
    expect(photoSrc).toMatch(/^blob:/)

    // A real scan result carries NO "Example" chip — that flag is only on
    // the landing hero's curated sample (UX-F #167).
    await expect(page.getByTestId('scan-result-example-badge')).toHaveCount(0)

    // The kanji renders adjacent to the LLM-extracted provenance badge.
    await expect(page.getByTestId('scan-result-name-kanji')).toContainText('獺祭')

    // Flavor chart is present when the brand has a Sakenowa flavor_charts
    // row. Dassai (獺祭) always does in a mirrored corpus, but the
    // assertion is scoped to "if the section rendered, all six axes are
    // there" so a legitimate null-chart brand doesn't wedge this spec.
    // Testids come from the shared `FlavorProfileView` (same ones the sake
    // detail page and suggest cluster use).
    if (await page.getByTestId('brand-flavor-chart').isVisible()) {
      for (const axis of ['f1', 'f2', 'f3', 'f4', 'f5', 'f6']) {
        await expect(
          page.getByTestId(`flavor-axis-${axis}-bar`),
        ).toBeVisible()
      }
    }

    // The "Full bottle page" row points at the deep-dive page but is
    // NOT auto-followed — it's an explicit affordance.
    const openLink = page.getByTestId('scan-result-open-detail')
    await expect(openLink).toHaveAttribute(
      'href',
      new RegExp(`/en/sake/${dassaiBrandId}\\?from=scan$`),
    )

    // UX-C reverse cross-beverage hook (#164). When the brand has a
    // flavor chart, the card renders either a "match" branch (naming
    // 1–2 Western exemplars) or a "no-close-analog" branch (the
    // discovery-framed "distinctly Japanese profile" line). In either
    // case, the block is visible, the amber HeuristicDisclaimer is
    // rendered, and the cross-beverage ProvenanceBadge sits on the
    // heading baseline. If the brand happens to have no flavor chart
    // (rare in the mirrored corpus), the reverse block is absent —
    // gated on the same predicate as the chart above.
    if (await page.getByTestId('brand-flavor-chart').isVisible()) {
      await expect(page.getByTestId('scan-result-reverse-exemplar')).toBeVisible()
      await expect(page.getByTestId('heuristic-disclaimer')).toBeVisible()
      // ProvenanceBadge with kind=crossBeverageMap is on the reverse
      // block heading — pinned via data-kind, so a future style rework
      // doesn't accidentally strip the semantic label.
      await expect(
        page
          .getByTestId('scan-result-reverse-exemplar')
          .locator('[data-testid="provenance-badge"][data-kind="crossBeverageMap"]'),
      ).toBeVisible()
      // Exactly one of the two branches renders — either the match
      // template (naming a Western exemplar) or the honest "no analog"
      // line. Whichever branch fires, the block is not empty.
      const matchLine = page.getByTestId('scan-result-reverse-exemplar-match')
      const noAnalogLine = page.getByTestId('scan-result-reverse-exemplar-no-analog')
      const matchVisible = await matchLine.isVisible()
      const noAnalogVisible = await noAnalogLine.isVisible()
      expect(matchVisible || noAnalogVisible).toBe(true)
      expect(matchVisible && noAnalogVisible).toBe(false)
    }

    await context.close()
  })

  test('/de/scan upload skipped — coming-soon blocks the form in non-launched locale', async ({
    browser,
  }, testInfo) => {
    // The /de/ E2E parity coverage required by the slice spec is the
    // coming-soon assertion above (which IS the German-locale behavior
    // pre-launch). When DE flips into LAUNCHED_LOCALES (ADR-0008), this
    // becomes a real upload test in DE — for now we record the contract
    // as a skip with a clear reason.
    testInfo.skip(true, 'DE locale is pre-launch (ADR-0008); upload form does not render')
    void browser
  })

  test('/en/scan rate-limit — 6th scan in the same window shows the localized cap message', async ({
    browser,
  }, testInfo) => {
    // Phase 3 / S2 (#107): drive the form past the 5-call cap and verify
    // the localized rate-limit copy renders. Requires both DATABASE_URL
    // (so the matched sake page resolves on calls 1-5) AND the
    // rate-limit env triplet (so the action's enforceRateLimit() runs
    // against a real Upstash). CI without that wiring skips — the
    // anonymousRateLimit module's vitest suite covers the same shape
    // against an in-memory KV.
    testInfo.skip(
      dassaiBrandId === null,
      'DATABASE_URL not set or Dassai not in the Sakenowa mirror — DB-bound spec',
    )
    const hasRateLimitEnv =
      Boolean(process.env.SESSION_COOKIE_SECRET) &&
      Boolean(process.env.IP_HASH_SALT) &&
      Boolean(process.env.UPSTASH_REDIS_REST_URL) &&
      Boolean(process.env.UPSTASH_REDIS_REST_TOKEN)
    testInfo.skip(
      !hasRateLimitEnv,
      'Rate-limit env triplet not set (SESSION_COOKIE_SECRET / IP_HASH_SALT / UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN)',
    )
    // The dev escape hatch unmeters the server, so there is no cap to reach.
    testInfo.skip(process.env.RATE_LIMIT_BYPASS === '1', 'RATE_LIMIT_BYPASS=1 — the server does not meter scans')

    const context = await browser.newContext({ locale: 'en-US' })
    await context.addCookies([AGE_GATE_COOKIE])
    const page = await context.newPage()

    // First 5 scans render the in-place result card (ADR-0015 — no more
    // auto-navigate). Reset each time so the file input can accept a
    // fresh pick.
    for (let i = 0; i < 5; i++) {
      await page.goto('/en/scan')
      await expect(page.getByTestId('scan-entry-page')).toBeVisible()
      await page.getByTestId('scan-file-input').setInputFiles(FIXTURE_IMAGE)
      await expect(page.getByTestId('scan-result-card')).toBeVisible()
    }

    // Sixth scan in the same 24h window — the rate-limited copy renders
    // in place of the matched result card.
    await page.goto('/en/scan')
    await expect(page.getByTestId('scan-entry-page')).toBeVisible()
    await page.getByTestId('scan-file-input').setInputFiles(FIXTURE_IMAGE)
    await expect(page.getByTestId('scan-error-rate-limited')).toBeVisible()
    // ...and on screen, not merely in the DOM. Since §4 made the camera one
    // screen tall, this line rendered below it — "visible" to Playwright,
    // invisible to the visitor, who saw only the shutter come back.
    await expect(page.getByTestId('scan-error-rate-limited')).toBeInViewport()
    // Page does not navigate away — the visitor stays on /en/scan.
    expect(page.url()).toMatch(/\/en\/scan$/)

    await context.close()
  })
})
