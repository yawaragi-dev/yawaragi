import { cookies } from 'next/headers'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import type { Metadata } from 'next'
import { Link } from '@/i18n/navigation'
import { isLaunched } from '@/i18n/launch-state'
import { AgeGate } from '@/components/legal/age-gate'
import { CrossBeverageSeedForm } from '@/components/profile/cross-beverage-seed-form'
import { TasteProvenanceSummary } from '@/components/profile/taste-provenance-summary'
import { FlavorRadarView } from '@/components/sake/flavor-radar-view'
import { knownCrossBeverageDescriptors } from '@/lib/cross-beverage/forward-lookup'
import { isDebugEnabledFromCookies } from '@/lib/debug/debug-mode'
import { hasAcceptedAgeGate } from '@/lib/legal/age-gate-cookie'
import { readAnonymousSessionCookie } from '@/lib/legal/anonymous-session-cookie'
import type { FlavorProfile } from '@/lib/schemas/flavor-profile'
import { getTasteEventStore } from '@/lib/taste/get-taste-event-store'
import {
  type SessionTasteProfile,
  readSessionTasteProfile,
} from '@/lib/taste/read-session-taste-profile'
import type { CrossBeverageSeedInput } from '@/lib/taste/taste-action-state'
import { env } from '@/env'

/**
 * `/[locale]/profile` — the real Taste Profile (Phase 5 / #220, P5-04b).
 *
 * Radar-first: the visitor's derived TasteProfile (ADR-0019) rendered as the
 * `<FlavorRadarView />`, with "what shaped this" provenance below and the
 * cross-beverage seed form to build/refine it. The seed form is the cheap,
 * deterministic build path — `/suggest` (an expensive LLM tool loop) is only a
 * quiet secondary link, never the hero.
 *
 * States: `profile` (radar + provenance) · `cold_start` (faded sample radar +
 * seed form as hero) · `unavailable` (non-prod without session/store env).
 *
 * Age gate: renders flavor data → gated content (CLAUDE.md). Locale launch is
 * handled upstream by the proxy; the belt below keeps a non-launched deep-link
 * on the coming-soon block. Debug trace: ADR-0013 — the seed form pushes
 * client events + forwards the action's server trace when `yawaragi_debug=1`.
 */

type Beverage = CrossBeverageSeedInput['beverage']

// Illustrative sample (a fragrant/crisp read) shown faded on cold start so the
// visitor sees what a real map looks like before they have one. Not personal
// data, not Sakenowa data — no attribution (ADR-0005).
const COLD_START_SAMPLE: FlavorProfile = { f1: 0.72, f2: 0.35, f3: 0.25, f4: 0.45, f5: 0.55, f6: 0.68 }

const tp = (
  f1: number,
  f2: number,
  f3: number,
  f4: number,
  f5: number,
  f6: number,
): FlavorProfile => ({ f1, f2, f3, f4, f5, f6 })

type CookieJar = Awaited<ReturnType<typeof cookies>>

/**
 * Read the session's taste profile, with a non-production stub seam
 * (`yawaragi_taste_stub` cookie) so the Playwright E2E can drive each state
 * without a live Upstash — mirrors scan's `e2e-stub` / suggest's stub cookie.
 */
async function resolveSessionTasteProfile(cookieJar: CookieJar): Promise<SessionTasteProfile> {
  if (process.env.NODE_ENV !== 'production') {
    const stub = cookieJar.get('yawaragi_taste_stub')?.value
    if (stub === 'cold_start') return { kind: 'cold_start' }
    if (stub === 'unavailable') return { kind: 'unavailable' }
    if (stub === 'populated') {
      return {
        kind: 'profile',
        profile: tp(0.68, 0.42, 0.3, 0.5, 0.4, 0.62),
        events: [
          { kind: 'rating', rating: 5, brandId: 1, target: tp(0.7, 0.4, 0.3, 0.5, 0.4, 0.6), occurredAt: 1 },
          { kind: 'scan_accept', brandId: 2, target: tp(0.6, 0.5, 0.35, 0.45, 0.4, 0.6), occurredAt: 2 },
          { kind: 'cross_beverage_seed', descriptor: 'smoky', target: tp(0.1, 0.8, 0.75, 0.2, 0.7, 0.15), occurredAt: 3 },
        ],
      }
    }
  }
  const secret = env.SESSION_COOKIE_SECRET
  const session = secret ? readAnonymousSessionCookie(cookieJar, secret) : null
  return readSessionTasteProfile({
    store: getTasteEventStore(),
    sid: session?.sid ?? null,
    now: Date.now(),
  })
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'profile' })
  return { title: `${t('title')} · Yawaragi` }
}

export default async function ProfilePage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  setRequestLocale(locale)

  // Belt on top of the proxy's suspenders (ADR-0008): a non-launched deep-link
  // renders the same coming-soon block /scan and /suggest use.
  if (!isLaunched(locale)) {
    const tComingSoon = await getTranslations({ locale, namespace: 'comingSoon' })
    return (
      <main
        className="flex flex-1 w-full max-w-3xl mx-auto flex-col gap-6 py-16 px-8"
        data-testid="coming-soon"
      >
        <h1 className="text-4xl font-semibold leading-tight tracking-tight">{tComingSoon('title')}</h1>
        <p className="text-base text-zinc-700 dark:text-zinc-300 max-w-prose">{tComingSoon('body')}</p>
        <Link href="/" locale="en" className="text-base font-medium underline underline-offset-4">
          {tComingSoon('switchToEn')}
        </Link>
      </main>
    )
  }

  const cookieJar = await cookies()
  if (!hasAcceptedAgeGate(cookieJar)) {
    return <AgeGate />
  }

  const t = await getTranslations('profile')
  const debugMode = isDebugEnabledFromCookies(cookieJar)
  const session = await resolveSessionTasteProfile(cookieJar)

  const descriptorsByBeverage = {
    whisky: knownCrossBeverageDescriptors('whisky'),
    wine: knownCrossBeverageDescriptors('wine'),
    beer: knownCrossBeverageDescriptors('beer'),
    spirit: knownCrossBeverageDescriptors('spirit'),
    fortified: knownCrossBeverageDescriptors('fortified'),
    cider: knownCrossBeverageDescriptors('cider'),
  } satisfies Record<Beverage, readonly string[]>

  const quietSuggestLink = (
    <Link
      href="/suggest"
      className="w-fit text-xs text-zinc-500 underline underline-offset-2 hover:text-zinc-700 dark:text-zinc-500 dark:hover:text-zinc-300"
      data-testid="profile-suggest-quiet-link"
    >
      {t('suggestQuietLink')} <span aria-hidden>→</span>
    </Link>
  )

  return (
    <main
      className="flex flex-1 w-full max-w-3xl mx-auto flex-col gap-10 py-12 px-6"
      data-testid="profile-page"
    >
      <section className="flex flex-col gap-3">
        <h1 className="text-3xl font-semibold leading-tight tracking-tight">{t('title')}</h1>
        <p className="max-w-prose text-base text-zinc-700 dark:text-zinc-300">{t('intro')}</p>
      </section>

      {session.kind === 'unavailable' && (
        <section data-testid="profile-unavailable" className="flex flex-col gap-3">
          <p className="max-w-prose text-sm text-zinc-600 dark:text-zinc-400">{t('unavailableBody')}</p>
        </section>
      )}

      {session.kind === 'cold_start' && (
        <section data-testid="profile-cold-start" className="flex flex-col gap-8">
          <figure className="flex flex-col items-center gap-3">
            <div className="opacity-40">
              <FlavorRadarView profile={COLD_START_SAMPLE} />
            </div>
            <figcaption className="max-w-md text-center text-xs text-zinc-500 dark:text-zinc-500">
              {t('sampleCaption')}
            </figcaption>
          </figure>
          <section className="flex flex-col gap-3">
            <h2 className="text-lg font-medium">{t('coldStartHeading')}</h2>
            <p className="max-w-prose text-sm text-zinc-600 dark:text-zinc-400">{t('coldStartBody')}</p>
            <h3 className="mt-2 text-base font-medium">{t('seedHeading')}</h3>
            <CrossBeverageSeedForm descriptorsByBeverage={descriptorsByBeverage} debugMode={debugMode} />
          </section>
          {quietSuggestLink}
        </section>
      )}

      {session.kind === 'profile' && (
        <section data-testid="profile-populated" className="flex flex-col gap-8">
          <div className="flex justify-center">
            <FlavorRadarView profile={session.profile} />
          </div>
          <TasteProvenanceSummary events={session.events} />
          <section className="flex flex-col gap-3">
            <h2 className="text-lg font-medium">{t('refineHeading')}</h2>
            <p className="max-w-prose text-sm text-zinc-600 dark:text-zinc-400">{t('refineBody')}</p>
            <CrossBeverageSeedForm descriptorsByBeverage={descriptorsByBeverage} debugMode={debugMode} />
          </section>
          {quietSuggestLink}
        </section>
      )}
    </main>
  )
}
