// E2E coverage for §6 Similar sakes — `/[locale]/sake/[brandId]/similar`.
//
// §6 is the design's cheapest real surface: "Plain ranked list, **no chat, no
// model call**." These specs pin the three things that make that true and
// keep it honest:
//
//   1. **It renders a ranked list from real flavour data**, with a percentage
//      and a reason per row, and no provenance badge — the rows are
//      `sakenowa_inferred` (deterministic maths over Sakenowa), not an LLM
//      claim, so ADR-0005's badge requirement does not apply. A badge
//      appearing here would mean something started guessing.
//   2. **Sakenowa attribution is present.** Every row is flavour data, so the
//      licence requires it regardless of placement.
//   3. **It is age-gated.** Flavour data behind the 18+ confirmation is not
//      negotiable (JMStV §6(5) / ADR-0006), and this is a brand-new route —
//      exactly the kind that gets forgotten.
//
// The list itself is DB-bound and skips without DATABASE_URL, like
// `sake-page.spec.ts`. The gating and DE specs are not: the proxy intercepts
// before any query runs.
import { expect, test } from '@playwright/test'
import { BASE_URL } from './_base-url'
import { findBrandWithFlavorChartId } from './_db-fixtures'

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

let chartedBrandId: number | null = null

test.beforeAll(async () => {
  chartedBrandId = await findBrandWithFlavorChartId()
})

test.describe('§6 similar sakes', () => {
  test('ranks real sakes with a percentage and a reason, and credits Sakenowa', async ({
    browser,
  }, testInfo) => {
    testInfo.skip(
      chartedBrandId === null,
      'DATABASE_URL not set or no charted brand in the mirror — DB-bound spec',
    )

    const context = await browser.newContext({ locale: 'en-US' })
    await context.addCookies([AGE_GATE_COOKIE, CONSENT_COOKIE])
    const page = await context.newPage()

    await page.goto(`/en/sake/${chartedBrandId}/similar`)
    await expect(page.getByTestId('similar-sakes-page')).toBeVisible()

    const rows = page.getByTestId('similar-sake-row')
    const count = await rows.count()
    // §6 says top 5. A thin mirror may hold fewer, so the assertion is "some,
    // never more than five" rather than exactly five.
    expect(count).toBeGreaterThan(0)
    expect(count).toBeLessThanOrEqual(5)

    // Every row carries both halves of §6's row: the percentage and the
    // one-line reason built from the axis differences.
    await expect(rows.first().getByTestId('similar-sake-percent')).toContainText('%')
    await expect(rows.first().getByTestId('similar-sake-reason')).not.toBeEmpty()

    // The subject must not be its own match. Anchored, not a substring
    // check: `/sake/2` sits inside `/sake/2265`, and the first run of this
    // test passed a real match off as the subject because of it.
    for (let i = 0; i < count; i++) {
      // The testid sits on the anchor itself, so read it directly.
      const href = await rows.nth(i).getAttribute('href')
      expect(href).not.toMatch(new RegExp(`/sake/${chartedBrandId}$`))
    }

    // Licence: flavour data on the page means attribution on the page.
    await expect(page.getByTestId('sakenowa-attribution-end')).toBeVisible()

    // The RANKING is deterministic maths, not a model — so no provenance
    // badge on the similarity itself. If one shows up here, something started
    // inferring.
    await expect(page.getByTestId('provenance-badge')).toHaveCount(0)

    // Each row's romaji IS model-generated, though — a Hepburn reading from
    // Haiku at ingest time, which Sakenowa does not publish. §16's disclosure
    // covers the column once instead of chipping every row, and its caveat
    // stays in the DOM so assistive tech reaches it without opening anything.
    const caveat = page.getByTestId('info-sheet-similar-romaji-caveat')
    await expect(caveat).toBeVisible()
    await expect(page.getByTestId('info-sheet-similar-romaji-trigger')).toHaveAttribute(
      'aria-describedby',
      await caveat.evaluate((el) => el.id),
    )

    await context.close()
  })

  test('is reachable from the bottle page, and back returns to it', async ({
    browser,
  }, testInfo) => {
    testInfo.skip(chartedBrandId === null, 'DB-bound spec')

    const context = await browser.newContext({ locale: 'en-US' })
    await context.addCookies([AGE_GATE_COOKIE, CONSENT_COOKIE])
    const page = await context.newPage()

    await page.goto(`/en/sake/${chartedBrandId}`)
    // The bottle page used to send this at `/suggest?seed=`, which runs the
    // paid tool loop. It is deterministic now.
    await page.getByTestId('similar-sakes-link').click()
    await expect(page).toHaveURL(new RegExp(`/en/sake/${chartedBrandId}/similar$`))

    await page.getByTestId('back-link').click()
    await expect(page).toHaveURL(new RegExp(`/en/sake/${chartedBrandId}$`))

    await context.close()
  })

  test('shows no flavour data before the 18+ gate is accepted', async ({ browser }) => {
    const context = await browser.newContext({ locale: 'en-US' })
    const page = await context.newPage()

    // No age-gate cookie. A brand new route is exactly the kind that gets
    // left out of the gate, and the gate list is deny-by-default for this
    // reason — this spec proves the default held.
    await page.goto('/en/sake/1/similar')

    await expect(page.getByTestId('similar-sakes-page')).toHaveCount(0)
    await expect(page.getByTestId('similar-sake-row')).toHaveCount(0)
    await expect(page.getByTestId('age-gate')).toBeVisible()

    await context.close()
  })

  test('/de is gated to coming-soon like every other app route (ADR-0008)', async ({
    browser,
  }) => {
    const context = await browser.newContext({ locale: 'de-DE' })
    await context.addCookies([AGE_GATE_COOKIE, CONSENT_COOKIE])
    const page = await context.newPage()

    await page.goto('/de/sake/1/similar')

    await expect(page.getByTestId('coming-soon')).toBeVisible()
    await expect(page.getByTestId('similar-sakes-page')).toHaveCount(0)

    await context.close()
  })
})
