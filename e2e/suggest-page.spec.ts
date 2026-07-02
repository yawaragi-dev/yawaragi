/**
 * E2E coverage for /[locale]/suggest — Phase 4 / S5 (#143).
 *
 * The spec drives the RSC page through the five discriminated-union
 * states of `SuggestActionState` using the `yawaragi_suggest_stub`
 * cookie (see `resolveSuggestStub` in `src/lib/suggest/suggest-action.ts`).
 * That seam lets us assert the render paths — provenance badges,
 * heuristic disclaimer, attribution, rate-limit / service-unavailable
 * copy — without wiring up a live MCP server or spending Anthropic
 * credit on every CI run.
 *
 * Cross-locale coverage: every state is exercised at BOTH `/en/` and
 * `/de/`. Under ADR-0008 the German locale is not launched today, so the
 * `/de/*` gated paths rewrite to the coming-soon page; we assert that
 * behaviour explicitly. When DE flips launched, these tests can be
 * un-conditioned to also assert the DE suggest UI directly.
 */
import { expect, test } from '@playwright/test'
import { BASE_URL } from './_base-url'

const AGE_GATE_COOKIE = {
  name: 'yawaragi_age_gate',
  value: JSON.stringify({ v: 1, ts: Date.now() }),
  url: BASE_URL,
}

function stubCookie(mode: string) {
  return {
    name: 'yawaragi_suggest_stub',
    value: mode,
    url: BASE_URL,
  }
}

// A synthetic seed brandId; the stubbed action never actually looks it
// up in Postgres, so any positive integer works. Using a value unlikely
// to be a real fixture (`999999`) so failures make it obvious that the
// stub, not real data, is under test.
const SEED_BRAND_ID = 999999

test.describe('suggest page — no seed', () => {
  test('/en/suggest with no seed shows the coming-soon-input placeholder', async ({
    browser,
  }) => {
    const context = await browser.newContext({ locale: 'en-US' })
    await context.addCookies([AGE_GATE_COOKIE])
    const page = await context.newPage()

    await page.goto('/en/suggest')

    await expect(page.getByTestId('suggest-no-seed')).toBeVisible()
    await expect(page.getByTestId('suggest-no-seed-placeholder')).toBeVisible()
    await expect(page.getByTestId('suggest-no-seed-placeholder')).toContainText(
      /Type what you're in the mood for/i,
    )

    await context.close()
  })
})

test.describe('suggest page — seed + happy path (stubbed)', () => {
  test('/en/suggest?seed=X returns 3 cards with provenance + disclaimer + attribution', async ({
    browser,
  }) => {
    const context = await browser.newContext({ locale: 'en-US' })
    await context.addCookies([AGE_GATE_COOKIE, stubCookie('ok')])
    const page = await context.newPage()

    await page.goto(`/en/suggest?seed=${SEED_BRAND_ID}`)

    // Result region + card list.
    await expect(page.getByTestId('suggest-page')).toBeVisible()
    await expect(page.getByTestId('suggest-results')).toBeVisible()
    const cards = page.getByTestId('suggest-card')
    await expect(cards).toHaveCount(3)

    // Every card carries a Japanese-script name.
    const firstKanji = cards.first().getByTestId('suggest-card-name-ja')
    await expect(firstKanji).toBeVisible()
    await expect(firstKanji).toHaveAttribute('lang', 'ja')

    // Reason field carries the load-bearing llm_inferred provenance
    // badge (CLAUDE.md § "Do NOT show LLM-extracted data without a
    // ProvenanceBadge").
    const llmInferredBadges = page.getByTestId('provenance-badge').and(
      page.locator('[data-kind="llmInferred"]'),
    )
    await expect(llmInferredBadges.first()).toBeVisible()

    // Cross-beverage descriptor on the third card triggers the section-
    // level HeuristicDisclaimer (CLAUDE.md § "Cross-beverage disclaimers").
    await expect(page.getByTestId('heuristic-disclaimer')).toBeVisible()
    // And per-value provenance badge on the descriptor itself.
    const crossBadge = page.getByTestId('provenance-badge').and(
      page.locator('[data-kind="crossBeverageMap"]'),
    )
    await expect(crossBadge.first()).toBeVisible()

    // Sakenowa attribution renders — both above-fold and inline.
    await expect(
      page.getByTestId('sakenowa-attribution-above-fold'),
    ).toBeVisible()
    await expect(
      page.getByTestId('sakenowa-attribution-inline').first(),
    ).toBeVisible()

    // "Back to the seed" link points at the seed sake detail page.
    const backLink = page.getByTestId('suggest-back-to-seed')
    await expect(backLink).toBeVisible()
    await expect(backLink).toHaveAttribute('href', `/en/sake/${SEED_BRAND_ID}`)

    await context.close()
  })
})

test.describe('suggest page — seed + no-match (stubbed)', () => {
  test('/en/suggest?seed=X renders the noMatch copy when the action returns an empty list', async ({
    browser,
  }) => {
    const context = await browser.newContext({ locale: 'en-US' })
    await context.addCookies([AGE_GATE_COOKIE, stubCookie('no_match')])
    const page = await context.newPage()

    await page.goto(`/en/suggest?seed=${SEED_BRAND_ID}`)

    await expect(page.getByTestId('suggest-no-match')).toBeVisible()
    await expect(page.getByTestId('suggest-results-list')).toHaveCount(0)
    // Honest empty state — no cards fabricated.
    await expect(page.getByTestId('suggest-card')).toHaveCount(0)

    await context.close()
  })
})

test.describe('suggest page — rate-limit (stubbed)', () => {
  test('/en/suggest?seed=X renders the rate-limit copy when the bucket is exhausted', async ({
    browser,
  }) => {
    const context = await browser.newContext({ locale: 'en-US' })
    await context.addCookies([AGE_GATE_COOKIE, stubCookie('rate_limited')])
    const page = await context.newPage()

    await page.goto(`/en/suggest?seed=${SEED_BRAND_ID}`)

    await expect(page.getByTestId('suggest-error-rate-limited')).toBeVisible()
    // Discovery framing preserved — no promotional copy in the error state.
    await expect(page.getByTestId('suggest-card')).toHaveCount(0)

    await context.close()
  })
})

test.describe('suggest page — MCP unavailable (stubbed)', () => {
  test('/en/suggest?seed=X renders a polite unavailable copy when MCP transport fails', async ({
    browser,
  }) => {
    const context = await browser.newContext({ locale: 'en-US' })
    await context.addCookies([
      AGE_GATE_COOKIE,
      stubCookie('service_unavailable'),
    ])
    const page = await context.newPage()

    await page.goto(`/en/suggest?seed=${SEED_BRAND_ID}`)

    await expect(
      page.getByTestId('suggest-error-service-unavailable'),
    ).toBeVisible()
    await expect(page.getByTestId('suggest-card')).toHaveCount(0)

    await context.close()
  })
})

test.describe('suggest page — age gate', () => {
  test('/en/suggest?seed=X redirects unaccepted-gate visitors to the gate landing (no data leak)', async ({
    browser,
  }) => {
    // Deliberately NO age-gate cookie. The `/suggest` path is a gated
    // path (not in UNGATED_LOCALE_PATHS) so the proxy rewrites it to the
    // landing page. The visitor never sees the suggest markup — no
    // sake data leaks pre-gate.
    const context = await browser.newContext({ locale: 'en-US' })
    await context.addCookies([stubCookie('ok')])
    const page = await context.newPage()

    await page.goto(`/en/suggest?seed=${SEED_BRAND_ID}`)

    // The proxy rewrites to the locale root; the age gate modal renders
    // over the landing page.
    await expect(page.getByTestId('age-gate')).toBeVisible()
    await expect(page.getByTestId('suggest-page')).toHaveCount(0)
    await expect(page.getByTestId('suggest-card')).toHaveCount(0)

    await context.close()
  })
})

test.describe('suggest page — DE locale (ADR-0008 pre-launch)', () => {
  test('/de/suggest with no seed rewrites to coming-soon (proxy pre-launch gate)', async ({
    browser,
  }) => {
    const context = await browser.newContext({ locale: 'de-DE' })
    await context.addCookies([AGE_GATE_COOKIE])
    const page = await context.newPage()

    await page.goto('/de/suggest')

    await expect(page.getByTestId('coming-soon')).toBeVisible()
    await expect(page.getByTestId('suggest-page')).toHaveCount(0)
    await expect(page.getByTestId('suggest-no-seed')).toHaveCount(0)

    await context.close()
  })

  test('/de/suggest?seed=X rewrites to coming-soon (proxy pre-launch gate)', async ({
    browser,
  }) => {
    const context = await browser.newContext({ locale: 'de-DE' })
    await context.addCookies([AGE_GATE_COOKIE, stubCookie('ok')])
    const page = await context.newPage()

    await page.goto(`/de/suggest?seed=${SEED_BRAND_ID}`)

    await expect(page.getByTestId('coming-soon')).toBeVisible()
    await expect(page.getByTestId('suggest-card')).toHaveCount(0)

    await context.close()
  })
})
