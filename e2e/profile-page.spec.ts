/**
 * E2E coverage for /[locale]/profile — §12 Palate.
 *
 * §12 is two screens, and the threshold between them is the product's:
 * under three tastings it says how far off a reading is and offers a way to
 * start; from three it gives the reading, how firm it is, and which axes drive
 * it. The `yawaragi_taste_stub` cookie drives each state without a live
 * Upstash (mirrors scan's e2e-stub / suggest's stub cookie) — including the
 * new `taking_shape` value, because the 1–2 tasting screen had no stub that
 * could reach it before.
 *
 * Age-gate still applies (the palate is flavor data → gated content). The six
 * axes use <FlavorAxisLabel /> and the radar carries its own brewers'-term
 * disclosure, so the Japanese vocabulary stays reachable (ADR-0022).
 */
import { expect, test } from '@playwright/test'
import { BASE_URL } from './_base-url'

const AGE_GATE_COOKIE = {
  name: 'yawaragi_age_gate',
  value: JSON.stringify({ v: 1, ts: Date.now() }),
  url: BASE_URL,
}

// Dismiss the cookie banner (fixed to the viewport bottom; can intercept
// clicks on links near the footer).
const CONSENT_COOKIE = {
  name: 'yawaragi_consent',
  value: JSON.stringify({ version: 1, analytics: false, marketing: false }),
  url: BASE_URL,
}

const tasteStub = (mode: 'populated' | 'taking_shape' | 'cold_start' | 'unavailable') => ({
  name: 'yawaragi_taste_stub',
  value: mode,
  url: BASE_URL,
})

test.describe('/en/profile — §12 Palate', () => {
  test('three tastings in, it names the palate and says which axes drive it', async ({
    browser,
  }) => {
    const context = await browser.newContext({ locale: 'en-US' })
    await context.addCookies([AGE_GATE_COOKIE, CONSENT_COOKIE, tasteStub('populated')])
    const page = await context.newPage()

    await page.goto('/en/profile')

    await expect(page.getByTestId('profile-page')).toBeVisible()
    await expect(page.getByTestId('palate-read')).toBeVisible()
    // §12's title at a read names the strongest axis and a lean — never the
    // placeholder words the earlier screens use.
    const title = page.getByTestId('palate-title')
    await expect(title).toBeVisible()
    await expect(title).not.toHaveText('Taking shape')
    await expect(title).not.toHaveText('Not yet')
    // Confidence, because a reading off three tastings and one off forty look
    // identical on a chart and the only honest difference is stated here.
    await expect(page.getByTestId('palate-confidence')).toContainText('3 of 10')
    await expect(page.getByTestId('taste-profile-radar')).toBeVisible()
    await expect(page.getByTestId('taste-profile-sample-polygon')).toBeAttached()
    for (const axis of ['f1', 'f2', 'f3', 'f4', 'f5', 'f6'] as const) {
      await expect(page.getByTestId(`flavor-axis-${axis}`)).toBeVisible()
    }
    // The radar does not go through the shared chart view, so it mounts its
    // own disclosure (ADR-0022). Easy to drop when the radar is next touched.
    await expect(page.getByText(/brewers' terms/i).first()).toBeVisible()

    // §12's "What shapes it": six rows, each with a bar AND a word. The word
    // is the row's point — a bar and a tick close together is a picture of
    // "about the same", and a picture is not reachable at a glance or by a
    // screen reader.
    await expect(page.getByTestId('palate-axis-rows')).toBeVisible()
    for (const axis of ['f1', 'f2', 'f3', 'f4', 'f5', 'f6'] as const) {
      await expect(page.getByTestId(`palate-axis-${axis}`)).toBeVisible()
    }
    // And something on the screen says what "most" means. The reference is the
    // catalogue's mean sake, not §12's "typical drinker" — that needs an
    // aggregation with no lawful basis yet (#297) — so the note has to name
    // the catalogue, or six rows of "More than most" would be read as a claim
    // about other drinkers. DB-dependent: with no mirror there is no reference
    // and the tick, the word and the note are all correctly absent.
    const note = page.getByTestId('palate-comparison-note')
    if ((await note.count()) > 0) {
      await expect(note).toContainText('catalogue')
      await expect(page.getByTestId('palate-axis-f1-word')).toBeVisible()
      await expect(page.getByTestId('palate-axis-f1-tick')).toBeAttached()
    }
    // "What shaped this" is present, and lists the seeded descriptor.
    await expect(page.getByTestId('taste-provenance-summary')).toBeVisible()
    await expect(page.getByTestId('taste-provenance-seeds')).toContainText('smoky')
    // P5-06: a populated profile surfaces ranked recommendations (the
    // "rate → recommender favors your zone" loop end-to-end; the dynamic
    // vector-shift itself is unit-tested in taste-recommender.test.ts). Each
    // recommendation links to its sake detail page.
    await expect(page.getByTestId('profile-recommendations')).toBeVisible()
    const firstRec = page.getByTestId('recommendation-101')
    await expect(firstRec).toBeVisible()
    await expect(firstRec).toHaveAttribute('href', '/en/sake/101')

    // The early screen's furniture is gone — a palate that still showed "2
    // more tastings and your first read appears" beside its own read would be
    // telling the visitor two different things.
    await expect(page.getByTestId('palate-early')).toHaveCount(0)
    await expect(page.getByTestId('palate-cold-start')).toHaveCount(0)

    await context.close()
  })

  test('one tasting in, it says how far off a read is rather than guessing', async ({
    browser,
  }) => {
    const context = await browser.newContext({ locale: 'en-US' })
    await context.addCookies([AGE_GATE_COOKIE, CONSENT_COOKIE, tasteStub('taking_shape')])
    const page = await context.newPage()

    await page.goto('/en/profile')

    // §12: "Taking shape" at 1–2 tastings. The threshold is three, and the
    // screen's job is to say so rather than render a six-axis reading off one
    // data point.
    await expect(page.getByTestId('palate-title')).toHaveText('Taking shape')
    await expect(page.getByTestId('palate-early')).toBeVisible()
    // No "So far: {sake}" assertion: naming the last tasting looks the brand
    // up in the Sakenowa mirror, and CI runs without one, so the line is
    // (correctly) absent there. It is a DB-bound nicety; what this spec pins
    // is the part that holds everywhere.
    //
    // Nothing points at a rating step that does not exist yet: no "N
    // more tastings", no "rate a few styles" tip, no "Scan a label" (a scan
    // does not feed the palate). They return when rating ships.
    await expect(page.getByText(/more tastings/)).toHaveCount(0)
    await expect(page.getByText('Rate a few different styles')).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'Scan a label' })).toHaveCount(0)
    await expect(page.getByTestId('palate-progress')).toHaveAttribute('aria-valuenow', '1')
    // No reading, and nothing that implies one.
    await expect(page.getByTestId('palate-read')).toHaveCount(0)
    await expect(page.getByTestId('palate-axis-rows')).toHaveCount(0)
    await expect(page.getByTestId('palate-confidence')).toHaveCount(0)

    await context.close()
  })

  test('with nothing rated, it offers five drinks you might know', async ({ browser }) => {
    const context = await browser.newContext({ locale: 'en-US' })
    await context.addCookies([AGE_GATE_COOKIE, CONSENT_COOKIE, tasteStub('cold_start')])
    const page = await context.newPage()

    await page.goto('/en/profile')

    await expect(page.getByTestId('palate-title')).toHaveText('Not yet')
    await expect(page.getByTestId('palate-cold-start')).toBeVisible()

    // §12 names bottles, not descriptors. This replaced two <select>s offering
    // the cross-beverage table's internal words ("peated", "off-dry",
    // "roasty") — a visitor knows what Guinness is; "roasty" is our word for
    // it. The chip still seeds from the same row, so only the vocabulary
    // changed.
    const chips = page.getByTestId('palate-cold-start').getByRole('button')
    expect(await chips.count()).toBeGreaterThanOrEqual(5)
    await expect(page.getByText('Lagavulin 16')).toBeVisible()
    await expect(page.getByText('Guinness')).toBeVisible()

    // CLAUDE.md: the cross-beverage mapping is heuristic → the disclaimer must
    // ride on this surface (title visible, body in the info-button tooltip,
    // and in the DOM either way).
    await expect(page.getByTestId('heuristic-disclaimer-title')).toBeVisible()
    await expect(page.getByTestId('heuristic-disclaimer-body')).toBeAttached()

    // Picking one acknowledges the tap immediately (#184) and states what it
    // sketched. The action itself needs a live store, so what is asserted is
    // the feedback — which is the half that was missing from the old form.
    const lagavulin = page.getByTestId('palate-cold-start-chip-peated')
    await lagavulin.click()
    await expect(lagavulin).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByTestId('palate-cold-start-seed-line')).toContainText('Lagavulin 16')

    await context.close()
  })

  test('a maintainer sees the Palate here now, not their journal', async ({ browser }) => {
    const context = await browser.newContext({ locale: 'en-US' })
    // The journal stub also stands in for the maintainer check (ADR-0020), so
    // this is a maintainer with a populated journal.
    await context.addCookies([
      AGE_GATE_COOKIE,
      CONSENT_COOKIE,
      { name: 'yawaragi_journal_stub', value: 'populated', url: BASE_URL },
    ])
    const page = await context.newPage()

    await page.goto('/en/profile')

    // The journal used to be rendered from an early return ahead of
    // everything else, so the only visitor with real tastings was the one
    // visitor who could never see the view derived from them. It lives at §11
    // Collection now — and this screen reads it as DATA.
    await expect(page.getByTestId('profile-page')).toBeVisible()
    await expect(page.getByTestId('journal-list')).toHaveCount(0)

    // Three journal entries is a read, so the Palate must be one — not "Not
    // yet". Moving the journal WITHOUT this would have left a maintainer with
    // every tasting they own and no reading of them, which is the regression
    // this assertion exists to catch.
    await expect(page.getByTestId('palate-read')).toBeVisible()
    await expect(page.getByTestId('palate-title')).not.toHaveText('Not yet')
    await expect(page.getByTestId('palate-confidence')).toContainText('3 of 10')

    await context.close()
  })

  test('shows the age gate when the cookie is absent', async ({ browser }) => {
    const context = await browser.newContext({ locale: 'en-US' })
    const page = await context.newPage()

    await page.goto('/en/profile')

    await expect(page.getByTestId('age-gate')).toBeVisible()
    await expect(page.getByTestId('profile-page')).toHaveCount(0)

    await context.close()
  })

  test('/de/profile rewrites to the coming-soon landing (DE not launched)', async ({ browser }) => {
    const context = await browser.newContext({ locale: 'de-DE' })
    await context.addCookies([AGE_GATE_COOKIE, CONSENT_COOKIE])
    const page = await context.newPage()

    await page.goto('/de/profile')

    await expect(page.getByTestId('coming-soon')).toBeVisible()
    await expect(page.getByTestId('profile-page')).toHaveCount(0)

    await context.close()
  })
})
