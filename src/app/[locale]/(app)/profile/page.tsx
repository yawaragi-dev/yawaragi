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
import { ColdStartChips, type ColdStartChipView } from '@/components/palate/cold-start-chips'
import { PalateAxisRows, type PalateAxisStrings } from '@/components/palate/palate-axis-rows'
import { PalateConfidence } from '@/components/palate/palate-confidence'
import { PalateProgress } from '@/components/palate/palate-progress'
import { TasteProvenanceSummary } from '@/components/profile/taste-provenance-summary'
import { FlavorRadarView } from '@/components/sake/flavor-radar-view'
import { SakenowaAttribution } from '@/components/sake/sakenowa-attribution'
import { coldStartChips } from '@/lib/cross-beverage/cold-start-chips'
import { resolveCrossBeverageTarget } from '@/lib/cross-beverage/forward-lookup'
import { isDebugEnabledFromCookies } from '@/lib/debug/debug-mode'
import { hasAcceptedAgeGate } from '@/lib/legal/age-gate-cookie'
import { readAnonymousSessionCookie } from '@/lib/legal/anonymous-session-cookie'
import type { FlavorAxis } from '@/lib/schemas/flavor-chart'
import type { FlavorProfile } from '@/lib/schemas/flavor-profile'
import type { TasteEvent } from '@/lib/schemas/taste-event'
import { lookupBrand } from '@/lib/sakenowa/lookup'
import { catalogueMeanProfile } from '@/lib/taste/catalogue-mean'
import { getFlavorCandidatePool } from '@/lib/taste/flavor-candidate-pool'
import { getTasteEventStore } from '@/lib/taste/get-taste-event-store'
import {
  PALATE_FIRM_THRESHOLD,
  palateLean,
  palateStage,
} from '@/lib/taste/palate-read'
import {
  type SessionTasteProfile,
  readSessionTasteProfile,
} from '@/lib/taste/read-session-taste-profile'
import { recommendFromTasteEvents } from '@/lib/taste/taste-recommender'
import { env } from '@/env'

/**
 * §12 Palate — `/[locale]/profile`. Reference screenshots 22 and 23.
 *
 * The Palate is a *derived view* of what you have rated (CONTEXT.md), and §12
 * draws it as two screens rather than one: under three tastings it shows how
 * far off a reading is and offers a way to start; from three it shows the
 * reading, how firm it is, and which axes drive it. The threshold is the
 * design's and the product's — "Your palate appears after three tastings."
 *
 * What this port changes beyond styling:
 *
 * - **The cold start is five named drinks, not sixty-two descriptors.** It was
 *   a pair of `<select>`s offering the cross-beverage table's internal words
 *   ("peated", "off-dry", "roasty"). §12 names bottles — Lagavulin 16,
 *   Guinness, Fino Sherry — and the chips resolve to the same rows, so the
 *   seed is identical and only the vocabulary changed. See
 *   `cold-start-chips.ts`.
 * - **"Taste map" and "taste profile" are gone from the copy.** The
 *   user-facing name is the Palate (ADR-0020, CONTEXT.md); the old strings
 *   predate that and said both.
 * - **Each axis says how it compares, in words.** A bar and a tick close
 *   together is a picture of "about the same", and a picture is not reachable
 *   at a glance or by a screen reader.
 *
 * Deviations, all recorded on #300:
 *
 * - **The reference tick is the catalogue's mean sake, not §12's "typical
 *   drinker".** A drinker average needs aggregated ratings, which in the EU
 *   needs §12's own one-time opt-in (#297) and a lawful basis not yet in
 *   ADR-0009's RoPA. The copy says "than most sakes" so the label matches what
 *   the number is. `catalogue-mean.ts` carries the reasoning.
 * - **No chart opt-in card** (§12's first element at 3+). That card IS the
 *   consent prompt for the aggregation above — it is #297, and a consent
 *   surface whose backing processing does not exist would be a dark pattern in
 *   the literal sense.
 * - **Rows are not tappable.** §12 sends each into the axis-detail screen
 *   (24), which is not built; a row that looks tappable and does nothing is
 *   the defect #184 was filed for.
 * - **"Styles you rate highest"** needs a style classification (junmai /
 *   daiginjō / kimoto) that the Sakenowa mirror does not carry at all.
 * - **The maintainer journal branch stays.** §12 is the Palate; the journal is
 *   §11 Collection, whose route is still a placeholder. It moves there in the
 *   §11 port, and this early return goes with it. Until then a maintainer
 *   lands on the journal here exactly as before.
 *
 * Two things §12 does not list are kept on purpose: `<TasteProvenanceSummary />`
 * (ADR-0013's debuggability — §12 puts "the tastings behind it" on the
 * unbuilt axis-detail screen, so removing it would leave no answer to "why
 * this number") and the recommendation list on the early screen (it is what a
 * seed actually buys; §12 makes the seed line the whole payoff, which would
 * make seeding feel inert).
 */

type CookieJar = Awaited<ReturnType<typeof cookies>>

const tp = (
  f1: number,
  f2: number,
  f3: number,
  f4: number,
  f5: number,
  f6: number,
): FlavorProfile => ({ f1, f2, f3, f4, f5, f6 })

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
    // One rating: §12's "Taking shape" screen, which no stub could reach
    // before — the only populated stub jumped straight to three events.
    if (stub === 'taking_shape') {
      return {
        kind: 'profile',
        profile: tp(0.68, 0.42, 0.3, 0.5, 0.4, 0.62),
        events: [
          { kind: 'rating', rating: 5, brandId: 1, target: tp(0.7, 0.4, 0.3, 0.5, 0.4, 0.6), occurredAt: 1 },
        ],
      }
    }
    if (stub === 'populated') {
      return {
        kind: 'profile',
        profile: tp(0.68, 0.42, 0.3, 0.5, 0.4, 0.62),
        events: [
          { kind: 'rating', rating: 5, brandId: 1, target: tp(0.7, 0.4, 0.3, 0.5, 0.4, 0.6), occurredAt: 1 },
          { kind: 'rating', rating: 4, brandId: 2, target: tp(0.6, 0.5, 0.35, 0.45, 0.4, 0.6), occurredAt: 2 },
          { kind: 'rating', rating: 4, brandId: 3, target: tp(0.66, 0.45, 0.3, 0.5, 0.4, 0.62), occurredAt: 3 },
          { kind: 'cross_beverage_seed', descriptor: 'smoky', target: tp(0.1, 0.8, 0.75, 0.2, 0.7, 0.15), occurredAt: 4 },
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
    if (stub === 'populated' || stub === 'taking_shape') return STUB_RECOMMENDATIONS
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

/** The ratings among a session's events — §12 counts tastings, not events. */
function countRatings(events: readonly TasteEvent[]): number {
  return events.filter((event) => event.kind === 'rating').length
}

/**
 * The most recent rating, for §12's "So far: {sake} {rating}." line.
 *
 * Degrades to `null`: the name comes from the mirror, and the line is a nicety
 * on a screen whose job is to say how far off a reading is.
 */
async function resolveLastRated(
  events: readonly TasteEvent[],
): Promise<{ name: string; rating: number } | null> {
  const ratings = events.filter((event) => event.kind === 'rating')
  const last = ratings[ratings.length - 1]
  if (!last || last.kind !== 'rating') return null
  try {
    const brand = await lookupBrand(last.brandId)
    if (!brand) return null
    return { name: brand.nameRomaji ?? brand.nameKanji, rating: last.rating }
  } catch {
    return null
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'palate' })
  return { title: `${t('title')} · Yawaragi` }
}

export default async function PalatePage({
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
        className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-5 py-6"
        data-testid="coming-soon"
      >
        <h1 className="text-title font-medium text-ink">{tComingSoon('title')}</h1>
        <p className="max-w-prose text-body text-ash-600">{tComingSoon('body')}</p>
        <Link href="/" locale="en" className="w-fit text-body font-medium text-ginshu-700 underline underline-offset-4">
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
  // persistent tasting journal. This is §11 Collection's content, not §12's,
  // and moves there with that port — see the file docstring.
  const maintainerView = await resolveMaintainerJournalView(cookieJar)
  if (maintainerView.isMaintainer && maintainerView.journal) {
    const journal = maintainerView.journal
    const tJournal = await getTranslations('journal')
    return (
      <main
        className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-5 py-6"
        data-testid="profile-journal-page"
      >
        <section className="flex flex-col gap-2">
          <h1 className="text-tab-title font-medium text-ink">{tJournal('title')}</h1>
          <p className="max-w-prose text-body text-ash-600">{tJournal('intro')}</p>
        </section>
        {journal.kind === 'unavailable' ? (
          <section data-testid="journal-unavailable" className="flex flex-col gap-3">
            <p className="max-w-prose text-body text-ash-600">{tJournal('unavailableBody')}</p>
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

  const t = await getTranslations('palate')
  const tAxis = await getTranslations('flavorAxis')
  const debugMode = isDebugEnabledFromCookies(cookieJar)
  const session = await resolveSessionTasteProfile(cookieJar)
  const events = session.kind === 'profile' ? session.events : []
  const profile = session.kind === 'profile' ? session.profile : null
  const ratingCount = countRatings(events)
  const stage = palateStage(ratingCount)

  const [reference, recommendations, lastRated] = await Promise.all([
    stage === 'read' ? catalogueMeanProfile() : Promise.resolve(null),
    profile ? resolveRecommendations(cookieJar, events) : Promise.resolve([]),
    stage === 'taking_shape' ? resolveLastRated(events) : Promise.resolve(null),
  ])

  // §12's title. At a read it names the two strongest axes — the display word
  // for the first (ADR-0022: Floral, Mellow, Rich, Mild, Dry, Light) and a
  // lean phrase for the second, so "Rich, umami-forward" rather than "Rich,
  // Mellow" which reads as two labels instead of one description.
  const title =
    stage === 'read' && profile
      ? t('titleRead', {
          top: tAxis(`${palateLean(profile).top}.label`),
          lean: t(`lean.${palateLean(profile).second}`),
        })
      : stage === 'taking_shape'
        ? t('titleTakingShape')
        : t('titleNone')

  const axisStrings: PalateAxisStrings = {
    heading: t('axisHeading'),
    axisLabel: (axis: FlavorAxis) => tAxis(`${axis}.label`),
    comparison: (comparison) => t(`comparison.${comparison}`),
    rowLabel: (axis: FlavorAxis, percent: number) =>
      t('axisRowLabel', { axis: tAxis(`${axis}.label`), percent }),
  }

  const chips: ColdStartChipView[] = coldStartChips().map((chip) => {
    // The "expect to like…" line comes from the row's own axes, not from
    // per-descriptor copy: 62 rows would each need editorial text in two
    // locales, which is how a line drifts out of agreement with its vector.
    const row = resolveCrossBeverageTarget(chip.descriptor, chip.beverage)
    const lean = row ? palateLean(row) : null
    return {
      ...chip,
      seedLine: lean
        ? t('coldStart.seedLine', {
            name: chip.name,
            first: tAxis(`${lean.top}.label`).toLocaleLowerCase(locale),
            second: tAxis(`${lean.second}.label`).toLocaleLowerCase(locale),
          })
        : t('coldStart.seedLineUnknown', { name: chip.name }),
    }
  })

  return (
    <main
      className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-5 py-6"
      data-testid="profile-page"
    >
      <section className="flex flex-col gap-1" data-testid="palate-header">
        <p className="text-section-label uppercase text-ash-600">{t('sectionLabel')}</p>
        <h1 className="text-hero font-medium text-ink" data-testid="palate-title">
          {title}
        </h1>
        <p className="text-subtle text-ash-600">
          {ratingCount > 0 ? t('derivedFrom', { count: ratingCount }) : t('derivedFromNone')}
        </p>
      </section>

      {session.kind === 'unavailable' && (
        <section data-testid="profile-unavailable">
          <p className="max-w-prose text-body text-ash-600">{t('unavailableBody')}</p>
        </section>
      )}

      {stage !== 'read' && (
        <div className="flex flex-col gap-5" data-testid="palate-early">
          <PalateProgress ratingCount={ratingCount} label={t('progressLabel')} />
          {/*
            The last tasting, when there is one — a fact about this visitor.

            Not here, on purpose (maintainer review on #330): §12's "N more
            tastings and your first read appears", its "Rate a few different
            styles" tip and its "Scan a label" button. A visitor has nowhere to
            rate a sake yet — `rateSake` has no screen until the bottle → Cellar
            → tasting-notes work lands, and a scan does not feed the palate —
            so all three pointed at a step that does not exist. The cold-start
            chips are the one input that works today, so they are the screen.
            The three return with rating.
          */}
          {lastRated !== null && (
            <p className="text-body text-ash-600" data-testid="palate-so-far">
              {t('soFar', { name: lastRated.name, rating: lastRated.rating })}
            </p>
          )}
          <ColdStartChips chips={chips} debugMode={debugMode} />
        </div>
      )}

      {stage === 'read' && profile && (
        <div className="flex flex-col gap-5" data-testid="palate-read">
          <div className="flex justify-center">
            <FlavorRadarView profile={profile} instanceId="palate" />
          </div>
          <PalateConfidence
            ratingCount={ratingCount}
            label={
              ratingCount >= PALATE_FIRM_THRESHOLD
                ? t('confidenceFirm', { count: ratingCount })
                : t('confidenceEarly', { count: ratingCount, of: PALATE_FIRM_THRESHOLD })
            }
          />
          <PalateAxisRows profile={profile} reference={reference} strings={axisStrings} />
          {reference !== null && (
            // The tick's label. §12 compares with "the typical drinker"; this
            // compares with the catalogue, and says so rather than borrowing
            // the design's words for a different number.
            <p className="text-meta text-ash-700" data-testid="palate-comparison-note">
              {t('comparisonNote')}
            </p>
          )}
          <TasteProvenanceSummary events={events} />
        </div>
      )}

      {recommendations.length > 0 && (
        <section className="flex flex-col gap-2" data-testid="profile-recommendations">
          <h2 className="text-section-label uppercase text-ash-600">{t('recommendedHeading')}</h2>
          <ul className="flex flex-col gap-2" role="list">
            {recommendations.map((rec) => (
              <li key={rec.brandId}>
                <Link
                  href={{
                    pathname: '/sake/[brandId]',
                    params: { brandId: String(rec.brandId) },
                  }}
                  data-testid={`recommendation-${rec.brandId}`}
                  // Centred in its 48px row, not baseline-aligned to the top of
                  // it: `items-baseline` on the row left the names sitting on
                  // the card's top edge with empty space under them. The
                  // kanji and romaji still share a baseline, inside.
                  className="flex min-h-12 items-center rounded-xl bg-surface px-4 py-2 shadow-yw-sm transition-colors hover:bg-ash-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ginshu-600"
                >
                  <span className="flex items-baseline gap-2">
                    <span className="text-card-heading font-medium text-ink" lang="ja">
                      {rec.nameJa}
                    </span>
                    {rec.nameRomaji && (
                      <span className="text-meta text-ash-600" lang="en">
                        {rec.nameRomaji}
                      </span>
                    )}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          {/*
            Under the list, not above it (maintainer review on #330): above,
            it sat between the heading and the sakes it credits and read as
            one more line of furniture. Directly under the list it is still
            "inline near the data", which is what ADR-0014 asks of a page
            where Sakenowa is one source among several.
          */}
          <SakenowaAttribution placement="inline" />
        </section>
      )}
    </main>
  )
}
