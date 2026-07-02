import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { notFound } from 'next/navigation'
import { hasLocale } from 'next-intl'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { Link } from '@/i18n/navigation'
import { routing } from '@/i18n/routing'
import { isLaunched } from '@/i18n/launch-state'
import { AgeGate } from '@/components/legal/age-gate'
import { hasAcceptedAgeGate } from '@/lib/legal/age-gate-cookie'
import { suggestAction } from '@/lib/suggest/suggest-action'
import type { SuggestActionState } from '@/lib/suggest/suggest-action-state'
import { SuggestResults } from './suggest-results'

/**
 * Phase 4 / S5 (#143) — `/[locale]/suggest`.
 *
 * Entry route for the seed-based sake discovery surface. Reads
 * `?seed=<brandId>` from the query string; when absent, renders a
 * placeholder that S6 (#144, freeform text input) will replace. When
 * present, delegates to the server action and renders one of
 * `<SuggestResults>` (ok / no-match), a rate-limit copy block, a service-
 * unavailable copy block, or a generic error copy block.
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
  searchParams: Promise<{ seed?: string | string[] }>
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

  const { seed: seedRaw } = await searchParams
  const seedString = Array.isArray(seedRaw) ? seedRaw[0] : seedRaw
  const seedBrandId = parseSeed(seedString)

  const tEntry = await getTranslations({ locale, namespace: 'suggest.entry' })
  const tResults = await getTranslations({ locale, namespace: 'suggest.results' })

  // No-seed branch: render the discovery-framed placeholder that S6 will
  // replace with the freeform-text input. The page still gates on age-gate
  // acceptance below, so no seed-derived data leaks either.
  if (seedBrandId === null) {
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
          <section
            className="rounded-md border border-zinc-200 bg-zinc-50 px-4 py-4 dark:border-zinc-800 dark:bg-zinc-900"
            data-testid="suggest-no-seed-placeholder"
          >
            <p className="font-medium">{tEntry('noSeedTitle')}</p>
            <p className="mt-2 text-sm text-zinc-700 dark:text-zinc-300">
              {tEntry('noSeedBody')}
            </p>
          </section>
        </main>
        {!gateAccepted && <AgeGate />}
      </>
    )
  }

  // Seed branch: call the server action and render the discriminated union.
  // The action itself runs the rate-limit gate, opens the MCP client, does
  // the tool loop, and validates. The page is a thin renderer.
  const state = await suggestAction({ kind: 'brand', brandId: seedBrandId })

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
        <SuggestStateView state={state} seedBrandId={seedBrandId} locale={locale} />
        <Link
          href={{ pathname: '/sake/[brandId]', params: { brandId: String(seedBrandId) } }}
          className="text-base font-medium underline underline-offset-4"
          data-testid="suggest-back-to-seed"
        >
          {tResults('backToSeed')}
        </Link>
      </main>
      {!gateAccepted && <AgeGate />}
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

interface SuggestStateViewProps {
  state: SuggestActionState
  seedBrandId: number
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
