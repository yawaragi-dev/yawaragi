import { cookies } from 'next/headers'
import { auth } from '@clerk/nextjs/server'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import type { Metadata } from 'next'
import { Link } from '@/i18n/navigation'
import { isLaunched } from '@/i18n/launch-state'
import { AgeGate } from '@/components/legal/age-gate'
import { JournalView } from '@/components/profile/journal/journal-view'
import { currentUserIsMaintainer } from '@/lib/auth/maintainer'
import type { JournalEntry } from '@/lib/schemas/journal-entry'
import { getJournalStore } from '@/lib/taste/get-journal-store'
import {
  type MaintainerJournalState,
  resolveMaintainerJournal,
} from '@/lib/taste/resolve-maintainer-journal'
import { CrossBeverageSeedForm } from '@/components/profile/cross-beverage-seed-form'
import { TasteProvenanceSummary } from '@/components/profile/taste-provenance-summary'
import { FlavorRadarView } from '@/components/sake/flavor-radar-view'
import { SakenowaAttribution } from '@/components/sake/sakenowa-attribution'
import { knownCrossBeverageDescriptors } from '@/lib/cross-beverage/forward-lookup'
import { isDebugEnabledFromCookies } from '@/lib/debug/debug-mode'
import { hasAcceptedAgeGate } from '@/lib/legal/age-gate-cookie'
import { readAnonymousSessionCookie } from '@/lib/legal/anonymous-session-cookie'
import type { FlavorProfile } from '@/lib/schemas/flavor-profile'
import type { TasteEvent } from '@/lib/schemas/taste-event'
import { getFlavorCandidatePool } from '@/lib/taste/flavor-candidate-pool'
import { getTasteEventStore } from '@/lib/taste/get-taste-event-store'
import {
  type SessionTasteProfile,
  readSessionTasteProfile,
} from '@/lib/taste/read-session-taste-profile'
import { recommendFromTasteEvents } from '@/lib/taste/taste-recommender'
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

// --- Maintainer tasting journal (ADR-0020, P5.5-C) ---------------------------

const STUB_JOURNAL_MAP: FlavorProfile = tp(0.62, 0.55, 0.4, 0.48, 0.3, 0.58)

// Canned journal for the non-production E2E stub (`yawaragi_journal_stub`),
// mirroring the anonymous `yawaragi_taste_stub` seam. Two entries across two
// months so the timeline's month grouping is exercised without a live Upstash.
const STUB_JOURNAL_ENTRIES: readonly JournalEntry[] = [
  {
    id: 's1',
    event: { kind: 'rating', rating: 5, brandId: 1, target: STUB_JOURNAL_MAP, occurredAt: Date.UTC(2026, 6, 18) },
    sake: { nameKanji: '而今', nameRomaji: 'Jikon' },
    notes: 'Melon and white peach, gone in a clean line.',
    triedAt: Date.UTC(2026, 6, 18),
    createdAt: Date.UTC(2026, 6, 18),
  },
  {
    id: 's2',
    event: { kind: 'rating', rating: 4, brandId: 2, target: STUB_JOURNAL_MAP, occurredAt: Date.UTC(2026, 5, 24) },
    sake: { nameKanji: '田酒', nameRomaji: 'Denshu' },
    triedAt: Date.UTC(2026, 5, 24),
    createdAt: Date.UTC(2026, 5, 24),
  },
]

function resolveJournalStub(stub: string): MaintainerJournalState {
  if (stub === 'unavailable') return { kind: 'unavailable' }
  if (stub === 'populated') {
    return { kind: 'journal', entries: STUB_JOURNAL_ENTRIES, profile: STUB_JOURNAL_MAP }
  }
  return { kind: 'empty' }
}

/**
 * Decide the maintainer branch. Kept out of the component body (like
 * `resolveSessionTasteProfile`) so the impure `Date.now()` read isn't in the
 * render path — the non-prod `yawaragi_journal_stub` seam also stands in for the
 * maintainer check + store so the E2E needs no Clerk/Upstash.
 */
async function resolveMaintainerJournalView(
  cookieJar: CookieJar,
): Promise<{ isMaintainer: boolean; journal: MaintainerJournalState | null }> {
  const journalStub =
    process.env.NODE_ENV !== 'production' ? cookieJar.get('yawaragi_journal_stub')?.value : undefined
  if (journalStub != null) {
    return { isMaintainer: true, journal: resolveJournalStub(journalStub) }
  }
  if (!(await currentUserIsMaintainer())) {
    return { isMaintainer: false, journal: null }
  }
  const { userId } = await auth()
  const journal = await resolveMaintainerJournal({
    store: getJournalStore(),
    userId,
    now: Date.now(),
  })
  return { isMaintainer: true, journal }
}

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

/** A Sake recommended for the visitor — enough to render a link + name. */
interface Recommendation {
  brandId: number
  nameJa: string
  nameRomaji: string | null
}

// Canned recommendations for the non-production E2E stub (the populated stub
// profile). The real path fetches a candidate pool and ranks it; the stub
// bypasses the DB so the E2E is deterministic without a live mirror.
const STUB_RECOMMENDATIONS: readonly Recommendation[] = [
  { brandId: 101, nameJa: '獺祭', nameRomaji: 'Dassai' },
  { brandId: 102, nameJa: '田酒', nameRomaji: 'Denshu' },
  { brandId: 103, nameJa: '而今', nameRomaji: 'Jikon' },
]

/**
 * Rank the candidate pool against the visitor's taste vector (P5-05b). Fetches
 * every charted Sake, ranks by flavor distance, excludes already-rated brands.
 * The pool fetch degrades to `[]` without a DB, so this yields no recs rather
 * than 500-ing the page.
 */
async function resolveRecommendations(
  cookieJar: CookieJar,
  events: readonly TasteEvent[],
): Promise<readonly Recommendation[]> {
  if (process.env.NODE_ENV !== 'production') {
    const stub = cookieJar.get('yawaragi_taste_stub')?.value
    if (stub === 'populated') return STUB_RECOMMENDATIONS
    if (stub) return []
  }
  const pool = await getFlavorCandidatePool()
  const result = recommendFromTasteEvents(events, pool, Date.now(), { limit: 6 })
  if (result.kind !== 'ranked') return []
  return result.results.map((match) => ({
    brandId: match.candidate.brandId,
    nameJa: match.candidate.nameJa,
    nameRomaji: match.candidate.nameRomaji,
  }))
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

  // Maintainer branch (ADR-0020): an allowlisted maintainer gets the REAL
  // persistent tasting journal; everyone else falls through to the anonymous,
  // interactive-but-ephemeral example below. The `yawaragi_journal_stub` cookie
  // (non-prod only) drives the journal states for the E2E without Clerk/Upstash,
  // and stands in for the maintainer check so the stub path needs no real auth.
  const maintainerView = await resolveMaintainerJournalView(cookieJar)
  if (maintainerView.isMaintainer && maintainerView.journal) {
    const journal = maintainerView.journal
    const tJournal = await getTranslations('journal')
    return (
      <main
        className="flex flex-1 w-full max-w-2xl mx-auto flex-col gap-10 py-12 px-6"
        data-testid="profile-journal-page"
      >
        <section className="flex flex-col gap-3">
          <h1 className="text-3xl font-semibold leading-tight tracking-tight">{tJournal('title')}</h1>
          <p className="max-w-prose text-base text-zinc-700 dark:text-zinc-300">{tJournal('intro')}</p>
        </section>
        {journal.kind === 'unavailable' ? (
          <section data-testid="journal-unavailable" className="flex flex-col gap-3">
            <p className="max-w-prose text-sm text-zinc-600 dark:text-zinc-400">
              {tJournal('unavailableBody')}
            </p>
          </section>
        ) : (
          <JournalView
            entries={journal.kind === 'journal' ? journal.entries : []}
            profile={journal.kind === 'journal' ? journal.profile : null}
            locale={locale}
          />
        )}
      </main>
    )
  }

  const t = await getTranslations('profile')
  const debugMode = isDebugEnabledFromCookies(cookieJar)
  const session = await resolveSessionTasteProfile(cookieJar)
  const recommendations =
    session.kind === 'profile' ? await resolveRecommendations(cookieJar, session.events) : []

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
          <figure className="relative flex flex-col items-center gap-3">
            <span
              className="absolute left-0 top-0 z-10 rounded-full bg-zinc-200 px-2.5 py-0.5 text-xs font-medium uppercase tracking-wide text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
              data-testid="profile-example-badge"
            >
              {t('exampleBadge')}
            </span>
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
          {recommendations.length > 0 && (
            <section className="flex flex-col gap-3" data-testid="profile-recommendations">
              <h2 className="text-lg font-medium">{t('recommendedHeading')}</h2>
              <p className="max-w-prose text-sm text-zinc-600 dark:text-zinc-400">
                {t('recommendedSubhead')}
              </p>
              <SakenowaAttribution placement="inline" />
              <ul className="flex flex-col gap-2">
                {recommendations.map((rec) => (
                  <li key={rec.brandId}>
                    <a
                      href={`/${locale}/sake/${rec.brandId}`}
                      data-testid={`recommendation-${rec.brandId}`}
                      className="flex items-baseline gap-2 rounded-md border border-zinc-200 px-3 py-2 transition-colors hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 dark:border-zinc-800 dark:hover:bg-zinc-900"
                    >
                      <span className="text-base font-medium" lang="ja">
                        {rec.nameJa}
                      </span>
                      {rec.nameRomaji && (
                        <span className="text-sm text-zinc-600 dark:text-zinc-400">
                          ({rec.nameRomaji})
                        </span>
                      )}
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          )}
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
