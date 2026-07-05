import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { notFound } from 'next/navigation'
import { hasLocale } from 'next-intl'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { Link } from '@/i18n/navigation'
import { routing } from '@/i18n/routing'
import { isLaunched } from '@/i18n/launch-state'
import { AgeGate } from '@/components/legal/age-gate'
import { DebugLogPusher } from '@/components/debug/debug-log-pusher'
import { hasAcceptedAgeGate } from '@/lib/legal/age-gate-cookie'
import { suggestAction } from '@/lib/suggest/suggest-action'
import {
  MAX_FREEFORM_QUERY_LEN,
  type SuggestActionState,
  type SuggestSeed,
} from '@/lib/suggest/suggest-action-state'
import { SuggestFreeformForm } from './suggest-freeform-form'
import { SuggestResults } from './suggest-results'
import { SuggestStarterPrompts } from './suggest-starter-prompts'

/**
 * Phase 4 / S5–S6 (#143, #144) — `/[locale]/suggest`.
 *
 * Entry route for the sake discovery surface. Two input modes:
 *
 *   - `?seed=<brandId>` — the seed-based path from #143, dispatched by the
 *     "Find similar" link on `/sake/[brandId]`.
 *   - `?q=<string>` — the freeform-text path from #144, dispatched by
 *     `<SuggestFreeformForm />`'s submit and by the starter-prompt chips.
 *
 * When neither param is set, the page renders the freeform form + the
 * discovery starter prompts (the "I don't know what I want" landing).
 * When either is set, the page delegates to `suggestAction` and renders
 * one of `<SuggestResults>` (ok / no-match), a rate-limit copy block, a
 * service-unavailable copy block, or a generic error copy block. Freeform
 * mode wins when both params are present — a typed query is a stronger
 * signal than a URL-carried seed.
 *
 * Age-gate + non-launched-locale posture mirrors `scan/page.tsx`:
 *
 *   - The proxy already rewrites gated paths for unaccepted-gate cookies
 *     (`/suggest` is a gated path — it's not in `UNGATED_LOCALE_PATHS`),
 *     so the page in practice only renders when the visitor has accepted
 *     the gate. The `!gateAccepted && <AgeGate />` fallback below is a
 *     belt-and-braces in case a future proxy refactor loosens the
 *     rewrite: any visitor who somehow lands here without the cookie
 *     still sees the gate modal before any sake data renders.
 *   - Non-launched locales (`de` today) render the coming-soon copy in
 *     place of the whole page.
 */

interface PageProps {
  params: Promise<{ locale: string }>
  searchParams: Promise<{ seed?: string | string[]; q?: string | string[] }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params
  if (!hasLocale(routing.locales, locale)) return {}
  const t = await getTranslations({ locale, namespace: 'suggest.entry' })
  return {
    title: `${t('title')} | Yawaragi`,
    description: t('intro'),
  }
}

export default async function SuggestPage({ params, searchParams }: PageProps) {
  const { locale } = await params
  if (!hasLocale(routing.locales, locale)) {
    notFound()
  }
  setRequestLocale(locale)

  // Non-launched-locale gate (ADR-0008): render coming-soon copy so
  // German visitors don't see the suggest surface before the Impressum +
  // Datenschutz copy has been reviewed.
  if (!isLaunched(locale)) {
    const tComingSoon = await getTranslations({ locale, namespace: 'comingSoon' })
    return (
      <main
        className="flex flex-1 w-full max-w-3xl mx-auto flex-col gap-6 py-16 px-8"
        data-testid="coming-soon"
      >
        <h1 className="text-4xl font-semibold leading-tight tracking-tight">
          {tComingSoon('title')}
        </h1>
        <p className="text-base text-zinc-700 dark:text-zinc-300 max-w-prose">
          {tComingSoon('body')}
        </p>
        <Link
          href="/"
          locale="en"
          className="text-base font-medium underline underline-offset-4"
        >
          {tComingSoon('switchToEn')}
        </Link>
      </main>
    )
  }

  const cookieJar = await cookies()
  const gateAccepted = hasAcceptedAgeGate(cookieJar)

  const { seed: seedRaw, q: qRaw } = await searchParams
  const seedString = Array.isArray(seedRaw) ? seedRaw[0] : seedRaw
  const seedBrandId = parseSeed(seedString)
  const qString = Array.isArray(qRaw) ? qRaw[0] : qRaw
  const freeformQuery = parseFreeform(qString)

  const tEntry = await getTranslations({ locale, namespace: 'suggest.entry' })
  const tResults = await getTranslations({ locale, namespace: 'suggest.results' })

  // Empty-input landing: no seed brand, no freeform query. Render the
  // freeform-text form + discovery starter prompts. The page still
  // gates on age-gate acceptance below, so no seed-derived data leaks.
  if (seedBrandId === null && freeformQuery === null) {
    return (
      <>
        <main
          className="flex flex-1 w-full max-w-3xl mx-auto flex-col gap-6 py-16 px-8"
          data-testid="suggest-no-seed"
        >
          <h1 className="text-4xl font-semibold leading-tight tracking-tight">
            {tEntry('title')}
          </h1>
          <p className="text-base text-zinc-700 dark:text-zinc-300 max-w-prose">
            {tEntry('intro')}
          </p>
          <SuggestFreeformForm />
          <SuggestStarterPrompts />
        </main>
        {!gateAccepted && <AgeGate />}
      </>
    )
  }

  // Freeform branch takes precedence over seed when both are present — a
  // typed query is a stronger signal than a seed carried over in the URL
  // from a prior navigation.
  const actionSeed: SuggestSeed =
    freeformQuery !== null
      ? { kind: 'freeform', query: freeformQuery }
      : { kind: 'brand', brandId: seedBrandId! }

  const state = await suggestAction(actionSeed)

  return (
    <>
      <main
        className="flex flex-1 w-full max-w-3xl mx-auto flex-col gap-6 py-16 px-8"
        data-testid="suggest-page"
      >
        <h1 className="text-4xl font-semibold leading-tight tracking-tight">
          {tEntry('title')}
        </h1>
        <p className="text-base text-zinc-700 dark:text-zinc-300 max-w-prose">
          {tEntry('intro')}
        </p>
        {/* The freeform form always renders in the result view so a
         * visitor can refine their query without navigating home. When
         * the current view was seeded from a `?q=...`, the form starts
         * pre-filled with that query for easy editing. */}
        {actionSeed.kind === 'freeform' && (
          <SuggestFreeformForm initialQuery={actionSeed.query} />
        )}
        <SuggestStateView state={state} locale={locale} />
        {actionSeed.kind === 'brand' && (
          <Link
            href={{
              pathname: '/sake/[brandId]',
              params: { brandId: String(actionSeed.brandId) },
            }}
            className="text-base font-medium underline underline-offset-4"
            data-testid="suggest-back-to-seed"
          >
            {tResults('backToSeed')}
          </Link>
        )}
      </main>
      {!gateAccepted && <AgeGate />}
      <DebugLogPusher events={state.debugLog} />
    </>
  )
}

/**
 * Parses the `?seed=<brandId>` query. Same strict digits-only guard as
 * `sake/[brandId]/page.tsx#parseBrandIdParam` — coercing `1abc` to `1` is
 * the class of bug we don't want at the URL boundary. Returns null on any
 * failure; the page renders the no-seed placeholder in that case (rather
 * than notFound, which would be too aggressive for an obviously-fixable
 * URL bug).
 */
function parseSeed(value: string | undefined): number | null {
  if (value === undefined || !/^\d+$/.test(value)) return null
  const n = Number(value)
  return Number.isInteger(n) && n > 0 ? n : null
}

/**
 * Parses the `?q=<string>` freeform query. Rejects empty / whitespace-
 * only strings so the empty-input branch above still fires for a
 * `?q=` URL that a visitor might land on via a stale link. Rejects
 * over-length strings for the same reason the action does — a URL-
 * pasted 5000-char blob shouldn't trigger a tool loop. The action
 * re-validates on its side, so this is a UX affordance, not a
 * security seam.
 */
function parseFreeform(value: string | undefined): string | null {
  if (value === undefined) return null
  const trimmed = value.trim()
  if (trimmed.length === 0) return null
  if (trimmed.length > MAX_FREEFORM_QUERY_LEN) return null
  return trimmed
}

interface SuggestStateViewProps {
  state: SuggestActionState
  locale: string
}

async function SuggestStateView({ state, locale }: SuggestStateViewProps) {
  const tResults = await getTranslations({ locale, namespace: 'suggest.results' })

  if (state.status === 'ok') {
    if (state.suggestions.length === 0) {
      return (
        <p
          className="rounded-md border border-zinc-200 bg-zinc-50 px-4 py-4 text-base text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300"
          data-testid="suggest-no-match"
        >
          {tResults('noMatch')}
        </p>
      )
    }
    return <SuggestResults suggestions={state.suggestions} />
  }

  if (state.status === 'rate_limited') {
    // The server-side `retryAfterSec` is a coarse "full window" value
    // (24h) — see anonymousRateLimit's comment on `retryAfterSec`. The
    // localized copy renders the number of hours; ICU pluralisation keeps
    // 1h and Nh grammatically correct in both locales.
    const hours = Math.max(1, Math.round(state.retryAfterSec / 3600))
    return (
      <p
        className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-base text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100"
        data-testid="suggest-error-rate-limited"
      >
        {tResults('rateLimited', { hours })}
      </p>
    )
  }

  if (state.status === 'service_unavailable') {
    return (
      <p
        className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-base text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100"
        data-testid="suggest-error-service-unavailable"
      >
        {tResults('serviceUnavailable')}
      </p>
    )
  }

  if (state.status === 'session_missing') {
    // Post-#161 defensive state: the middleware (src/proxy.ts) is the
    // sole writer of `yawaragi_session`, and the /suggest route is in
    // the middleware matcher, so this branch should not surface in
    // practice. Kept as a typed variant so a matcher gap / direct
    // action invocation lands as a polite UI message instead of a
    // thrown exception.
    return (
      <p
        className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-base text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100"
        data-testid="suggest-error-session-missing"
      >
        {tResults('sessionMissing')}
      </p>
    )
  }

  // `invalid_input` + `error` both fall through to the generic error copy.
  // `invalid_input` is unreachable from the page in practice (parseSeed
  // already narrows and the page routes to no-seed), but the type
  // exhaustiveness demands we handle it.
  return (
    <p
      className="rounded-md border border-red-300 bg-red-50 px-4 py-3 text-base text-red-900 dark:border-red-700 dark:bg-red-950 dark:text-red-100"
      data-testid="suggest-error-generic"
    >
      {tResults('error')}
    </p>
  )
}
