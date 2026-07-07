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

test.describe('suggest page — no seed (S6 landing view)', () => {
  test('/en/suggest with no query renders freeform form + starter prompts', async ({
    browser,
  }) => {
    const context = await browser.newContext({ locale: 'en-US' })
    await context.addCookies([AGE_GATE_COOKIE])
    const page = await context.newPage()

    await page.goto('/en/suggest')

    await expect(page.getByTestId('suggest-no-seed')).toBeVisible()
    // The freeform form is the primary entry point.
    await expect(page.getByTestId('suggest-freeform-form')).toBeVisible()
    await expect(page.getByTestId('suggest-freeform-input')).toBeVisible()
    await expect(page.getByTestId('suggest-freeform-submit')).toBeVisible()
    // Placeholder carries discovery framing (CLAUDE.md § "Age gate and
    // JMStV compliance") — no promotional copy.
    await expect(page.getByTestId('suggest-freeform-input')).toHaveAttribute(
      'placeholder',
      /light and floral|smoky whisky|Yamazaki/i,
    )

    // Starter prompts sit beneath the form, teaching phrasing without
    // hard-coding brand ids into the surface.
    await expect(page.getByTestId('suggest-starter')).toBeVisible()
    await expect(page.getByTestId('suggest-starter-prompt')).toHaveCount(6)
    // At least one prompt links a Western-descriptor path so the visitor
    // can discover the cross-beverage tool from the landing view.
    await expect(page.getByTestId('suggest-starter').getByText(/smoky whisky/i)).toBeVisible()

    await context.close()
  })

  test('/en/suggest typing a query and submitting navigates to ?q=', async ({
    browser,
  }) => {
    // Client-side form submit path. The freeform form's onSubmit calls
    // router.push({ pathname: '/suggest', query: { q } }); we assert the
    // URL round-trips and the result view renders. The stub cookie makes
    // the action return a deterministic ok list so the test doesn't
    // depend on MCP.
    const context = await browser.newContext({ locale: 'en-US' })
    await context.addCookies([AGE_GATE_COOKIE, stubCookie('ok')])
    const page = await context.newPage()

    await page.goto('/en/suggest')
    await page.getByTestId('suggest-freeform-input').fill('smoky whisky')
    await page.getByTestId('suggest-freeform-submit').click()

    await expect(page).toHaveURL(/\/en\/suggest\?q=smoky\+whisky|%20whisky/)
    await expect(page.getByTestId('suggest-page')).toBeVisible()
    await expect(page.getByTestId('suggest-results')).toBeVisible()
    // The result view keeps the freeform form mounted with the query
    // pre-filled so the visitor can refine without navigating home.
    await expect(page.getByTestId('suggest-freeform-input')).toHaveValue(
      'smoky whisky',
    )

    await context.close()
  })

  test('/en/suggest a starter-prompt chip navigates to ?q=<prompt> AND pre-fills the input', async ({
    browser,
  }) => {
    // The "I don't know what I want" path: chip click submits a canned
    // freeform query, which triggers the full result render.
    //
    // Regression guard: the S6 form used `useState(initialQuery)` which
    // only read the prop on mount. React reuses the form across the
    // empty→result navigation (same tree position), so a chip click
    // updated the URL but LEFT THE INPUT EMPTY on the result page.
    // The visitor couldn't see or edit the query that was actually run.
    // Post-fix, the form syncs `value` to `initialQuery` via useEffect
    // whenever the URL-derived prop changes.
    const context = await browser.newContext({ locale: 'en-US' })
    await context.addCookies([AGE_GATE_COOKIE, stubCookie('ok')])
    const page = await context.newPage()

    await page.goto('/en/suggest')
    await page.getByTestId('suggest-starter').getByText(/smoky whisky/i).click()

    await expect(page).toHaveURL(/\/en\/suggest\?q=/)
    await expect(page.getByTestId('suggest-results')).toBeVisible()
    // Load-bearing: the input reflects the chip prompt so the visitor
    // can refine ("smoky whisky, low ABV") without retyping.
    await expect(page.getByTestId('suggest-freeform-input')).toHaveValue(
      'smoky whisky',
    )

    await context.close()
  })

  test('/en/suggest chip click populates the input BEFORE the results render (#184)', async ({
    browser,
  }) => {
    // #184 AC: the input must reflect the picked prompt within one
    // frame of the click, not after the LLM tool loop finishes.
    // Regression guard: pre-#184 the chip was a raw <Link> — the
    // input stayed empty until the result-view mounted the freeform
    // form with `initialQuery`, which was several seconds later.
    //
    // We assert the input value BEFORE `suggest-results` is visible,
    // which forces the check to run during the transition — the same
    // window the visitor is staring at.
    const context = await browser.newContext({ locale: 'en-US' })
    await context.addCookies([AGE_GATE_COOKIE, stubCookie('ok')])
    const page = await context.newPage()

    await page.goto('/en/suggest')
    // No `await` on the click promise — we want to assert while the
    // transition is in flight.
    const clickPromise = page
      .getByTestId('suggest-starter')
      .getByText(/smoky whisky/i)
      .click()

    // The input reflects the picked prompt in the SAME frame — before
    // navigation completes. `suggest-results` is not yet visible.
    await expect(page.getByTestId('suggest-freeform-input')).toHaveValue(
      'smoky whisky',
    )

    // Let the navigation settle so context.close() doesn't tear down
    // an in-flight request.
    await clickPromise
    await expect(page.getByTestId('suggest-results')).toBeVisible()

    await context.close()
  })

  test('/en/suggest chip click flips the freeform submit button to Exploring… (#184)', async ({
    browser,
  }) => {
    // #184 AC: the shared `useTransition` fires on chip click, so the
    // freeform button's `Exploring…` label lights up in the same
    // frame — same visible feedback as a direct form submit. Before
    // the fix, the chip bypassed the form entirely; the button
    // stayed on "Explore" for the several seconds the tool loop
    // took to reach the next page.
    const context = await browser.newContext({ locale: 'en-US' })
    await context.addCookies([AGE_GATE_COOKIE, stubCookie('ok')])
    const page = await context.newPage()

    // Throttle the RSC segment fetch so the pending window stays
    // observable — otherwise `expect().toHaveText('Exploring')` could
    // race the transition and see the settled `Explore` state from
    // the freeform form re-mounted on the result page. 400 ms is a
    // comfortable window for Playwright's default polling; the stub
    // cookie means we're not spending Anthropic credit.
    await page.route(/\/en\/suggest\?q=/, async (route) => {
      await new Promise((r) => setTimeout(r, 400))
      await route.continue()
    })

    await page.goto('/en/suggest')

    const submitBtn = page.getByTestId('suggest-freeform-submit')
    // Sanity: idle state.
    await expect(submitBtn).toHaveText('Explore')

    const clickPromise = page
      .getByTestId('suggest-starter')
      .getByText(/smoky whisky/i)
      .click()

    // The button flips to `Exploring` while navigation is in flight —
    // BEFORE the results section renders. That's the 100 ms feedback
    // rule from `docs/agents/ux-design-playbook.md`. The animated
    // trailing dots live in a `.pending-ellipsis::after` pseudo-
    // element (see `globals.css`), which is not part of `.textContent`
    // — so this assertion matches the base word only.
    await expect(submitBtn).toHaveText('Exploring')
    // And the clicked chip announces `aria-busy` so AT users hear the
    // acknowledgement.
    await expect(
      page.getByTestId('suggest-starter').getByRole('button', {
        name: /smoky whisky/i,
      }),
    ).toHaveAttribute('aria-busy', 'true')

    await clickPromise
    await expect(page.getByTestId('suggest-results')).toBeVisible()

    await context.close()
  })

  test('/en/suggest?q=X loaded directly pre-fills the input from the URL', async ({
    browser,
  }) => {
    // Direct URL load — a bookmark, a shared link, or a browser
    // history entry the visitor navigated back to. Independent of the
    // chip-click test above because it exercises the OTHER path the
    // input-population bug could manifest through: the form's very
    // first render sees the URL-derived initialQuery, not the empty
    // default.
    const context = await browser.newContext({ locale: 'en-US' })
    await context.addCookies([AGE_GATE_COOKIE, stubCookie('ok')])
    const page = await context.newPage()

    await page.goto('/en/suggest?q=mellow%20and%20rich')

    await expect(page.getByTestId('suggest-freeform-input')).toHaveValue(
      'mellow and rich',
    )

    await context.close()
  })
})

test.describe('suggest page — freeform query (stubbed)', () => {
  test('/en/suggest?q=smoky returns cards with inline HeuristicDisclaimer next to descriptor', async ({
    browser,
  }) => {
    // S6 requirement: the HeuristicDisclaimer renders inline near the
    // cited descriptor value, NOT only at the top of the result list.
    // The stub `ok` mode places `cross_beverage_descriptor` on the third
    // card; we assert the disclaimer lives inside that same card's DOM
    // subtree.
    const context = await browser.newContext({ locale: 'en-US' })
    await context.addCookies([AGE_GATE_COOKIE, stubCookie('ok')])
    const page = await context.newPage()

    await page.goto('/en/suggest?q=smoky+whisky')

    await expect(page.getByTestId('suggest-page')).toBeVisible()
    await expect(page.getByTestId('suggest-results')).toBeVisible()

    const cards = page.getByTestId('suggest-card')
    await expect(cards).toHaveCount(3)

    // Card 3 (0-indexed 2) is the one with cross_beverage_descriptor in
    // the stub. The disclaimer must live INSIDE that card — that's
    // "inline near the cited descriptor" per S6's AC.
    const cardWithDescriptor = cards.nth(2)
    await expect(
      cardWithDescriptor.getByTestId('suggest-card-cross-beverage'),
    ).toBeVisible()
    await expect(
      cardWithDescriptor.getByTestId('heuristic-disclaimer'),
    ).toBeVisible()

    // Cards WITHOUT a descriptor should NOT carry a disclaimer — proves
    // the placement is per-card, not section-level.
    await expect(
      cards.nth(0).getByTestId('heuristic-disclaimer'),
    ).toHaveCount(0)
    await expect(
      cards.nth(1).getByTestId('heuristic-disclaimer'),
    ).toHaveCount(0)

    // The seed sake "Back to seed" link is absent — freeform mode has
    // no seed brand to return to.
    await expect(page.getByTestId('suggest-back-to-seed')).toHaveCount(0)

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

    // Round-2 fan-out coverage: the first two cards carry a
    // Sakenowa-sourced `flavor_profile` (hydrated by
    // `hydrateFlavorProfiles` in the real path, injected by the stub
    // here). The third card is deliberately chart-less to prove that
    // absence is skipped, not placeholder'd.
    const flavorClusters = page.getByTestId('suggest-card-flavor-cluster')
    await expect(flavorClusters).toHaveCount(2)
    // The first cluster renders all six axes with romaji + kanji per
    // CLAUDE.md § "6-axis flavor vocabulary" (never English-only).
    const firstCluster = flavorClusters.first()
    for (const axis of ['f1', 'f2', 'f3', 'f4', 'f5', 'f6']) {
      await expect(firstCluster.getByTestId(`flavor-axis-${axis}`)).toBeVisible()
      await expect(
        firstCluster.getByTestId(`flavor-axis-${axis}-romaji`),
      ).toBeVisible()
      await expect(
        firstCluster.getByTestId(`flavor-axis-${axis}-kanji`),
      ).toHaveAttribute('lang', 'ja')
    }
    // The third card has NO cluster — the mirror-null case renders
    // cleanly without any placeholder, not even an empty section.
    const thirdCard = cards.nth(2)
    await expect(
      thirdCard.getByTestId('suggest-card-flavor-cluster'),
    ).toHaveCount(0)

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

  test('/de/suggest?q=smoky (freeform path) also rewrites to coming-soon', async ({
    browser,
  }) => {
    // Freeform mode was added by S6 (#144). The pre-launch gate must
    // block it too — a stale link or shared URL should never leak the
    // suggest surface into DE ahead of the Impressum + Datenschutz
    // review. Same posture as the seed-mode gate above.
    const context = await browser.newContext({ locale: 'de-DE' })
    await context.addCookies([AGE_GATE_COOKIE, stubCookie('ok')])
    const page = await context.newPage()

    await page.goto('/de/suggest?q=smoky+whisky')

    await expect(page.getByTestId('coming-soon')).toBeVisible()
    await expect(page.getByTestId('suggest-freeform-form')).toHaveCount(0)
    await expect(page.getByTestId('suggest-card')).toHaveCount(0)

    await context.close()
  })
})
