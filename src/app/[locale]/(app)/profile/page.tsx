import { cookies } from 'next/headers'
import { auth } from '@clerk/nextjs/server'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import type { Metadata } from 'next'
import { Link } from '@/i18n/navigation'
import { isLaunched } from '@/i18n/launch-state'
import { AgeGate } from '@/components/legal/age-gate'
import { ColdStartChips, type ColdStartChipView } from '@/components/palate/cold-start-chips'
import { PalateAxisRows, type PalateAxisStrings } from '@/components/palate/palate-axis-rows'
import { PalateConfidence } from '@/components/palate/palate-confidence'
import { PalateProgress } from '@/components/palate/palate-progress'
import { TabHeader } from '@/components/layout/screen-header'
import { TasteProvenanceSummary } from '@/components/profile/taste-provenance-summary'
import { FlavorRadarView } from '@/components/sake/flavor-radar-view'
import { SakenowaAttributionView } from '@/components/sake/sakenowa-attribution'
import { coldStartChips } from '@/lib/cross-beverage/cold-start-chips'
import { resolveCrossBeverageTarget } from '@/lib/cross-beverage/forward-lookup'
import { currentUserIsMaintainer } from '@/lib/auth/maintainer'
import { isDebugEnabledFromCookies } from '@/lib/debug/debug-mode'
import { hasAcceptedAgeGate } from '@/lib/legal/age-gate-cookie'
import { readAnonymousSessionCookie } from '@/lib/legal/anonymous-session-cookie'
import { FLAVOR_AXES, type FlavorAxis } from '@/lib/schemas/flavor-chart'
import type { FlavorProfile } from '@/lib/schemas/flavor-profile'
import type { TasteEvent } from '@/lib/schemas/taste-event'
import { lookupBrand } from '@/lib/sakenowa/lookup'
import { journalEntriesToTasteEvents } from '@/lib/schemas/journal-entry'
import { catalogueMeanProfile } from '@/lib/taste/catalogue-mean'
import { getJournalStore } from '@/lib/taste/get-journal-store'
import { resolveJournalStub } from '@/lib/taste/journal-stub'
import { resolveMaintainerJournal } from '@/lib/taste/resolve-maintainer-journal'
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
 * The maintainer journal used to be rendered here, from an early return ahead
 * of everything else, which made one route serve two screens — and meant a
 * maintainer could never see this one. It lives at §11 Collection now, and
 * this screen reads it as *data* instead of rendering it: CONTEXT.md makes the
 * Palate "a derived output view of the TastingJournal", so the journal is the
 * primary source where there is one and the anonymous session store is the
 * fallback. Moving the journal without this would have left a maintainer with
 * a permanently empty Palate — every tasting they have, and no read of them.
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

/**
 * The journal, as a taste profile — the Palate's primary source.
 *
 * A JournalEntry embeds the TasteEvent it emits, so the same
 * `deriveTasteProfile` fold the anonymous stream uses reads it unchanged (see
 * `resolve-maintainer-journal.ts`: "one derivation path, two sources"). What
 * this adds is the *second* caller of that path, now that §11 owns the
 * rendering.
 *
 * Returns `null` when there is no journal to read — not a maintainer, no
 * store, or no entries — so the caller falls through to the anonymous session.
 */
async function resolveJournalTasteProfile(
  cookieJar: CookieJar,
): Promise<SessionTasteProfile | null> {
  const journalStub =
    process.env.NODE_ENV !== 'production'
      ? cookieJar.get('yawaragi_journal_stub')?.value
      : undefined
  const journal =
    journalStub != null
      ? resolveJournalStub(journalStub)
      : (await currentUserIsMaintainer())
        ? await resolveMaintainerJournal({
            store: getJournalStore(),
            userId: (await auth()).userId,
            now: Date.now(),
          })
        : null
  if (journal === null || journal.kind !== 'journal') return null
  return {
    kind: 'profile',
    profile: journal.profile,
    events: journalEntriesToTasteEvents(journal.entries),
  }
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
interface Recommendation extends FlavorProfile {
  brandId: number
  nameJa: string
  nameRomaji: string | null
  brewery: string | null
  prefecture: string | null
}

// Canned recommendations for the non-production E2E stub (the populated stub
// profile). The real path fetches a candidate pool and ranks it; the stub
// bypasses the DB so the E2E is deterministic without a live mirror.
const STUB_RECOMMENDATIONS: readonly Recommendation[] = [
  { brandId: 101, nameJa: '獺祭', nameRomaji: 'Dassai', brewery: 'Asahi Shuzo', prefecture: 'Yamaguchi', f1: 0.62, f2: 0.4, f3: 0.25, f4: 0.45, f5: 0.35, f6: 0.58 },
  { brandId: 102, nameJa: '田酒', nameRomaji: 'Denshu', brewery: 'Nishida Shuzoten', prefecture: 'Aomori', f1: 0.3, f2: 0.6, f3: 0.55, f4: 0.4, f5: 0.5, f6: 0.3 },
  { brandId: 103, nameJa: '而今', nameRomaji: 'Jikon', brewery: 'Kiyasho Shuzo', prefecture: 'Mie', f1: 0.58, f2: 0.55, f3: 0.3, f4: 0.42, f5: 0.32, f6: 0.5 },
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
  return result.results.map(({ candidate }) => ({
    brandId: candidate.brandId,
    nameJa: candidate.nameJa,
    nameRomaji: candidate.nameRomaji,
    brewery: candidate.brewery,
    prefecture: candidate.prefecture,
    f1: candidate.f1,
    f2: candidate.f2,
    f3: candidate.f3,
    f4: candidate.f4,
    f5: candidate.f5,
    f6: candidate.f6,
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

  const t = await getTranslations('palate')
  const tAxis = await getTranslations('flavorAxis')
  const tAttribution = await getTranslations('sakenowaAttribution')
  const debugMode = isDebugEnabledFromCookies(cookieJar)
  // The journal first, the anonymous session second. A maintainer's tastings
  // are the real thing; the session store is what an anonymous visitor builds
  // from scans and cross-beverage seeds.
  const journalSession = await resolveJournalTasteProfile(cookieJar)
  const session = journalSession ?? (await resolveSessionTasteProfile(cookieJar))
  // v1.5 §12: the rating slot shows only once rating is available to the
  // visitor — today, someone who keeps a journal (ADR-0020).
  const canRate = journalSession !== null
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
  // v1.5 §12 header, the tab pattern: one title, one meta line. Under three
  // tastings the title is "Your palate" and the meta says how far along it is
  // ("So far" moved into it).
  const title =
    stage === 'read' && profile
      ? t('titleRead', {
          top: tAxis(`${palateLean(profile).top}.label`),
          lean: t(`lean.${palateLean(profile).second}`),
        })
      : t('titleEarly')
  const meta =
    stage === 'read'
      ? t('derivedFrom', { count: ratingCount })
      : stage === 'taking_shape'
        ? lastRated
          ? t('metaTakingShape', { name: lastRated.name, rating: lastRated.rating })
          : t('metaTakingShapeBare')
        : t('metaNone')

  // "Same shape as {drink}" — the drink the visitor last seeded from, when the
  // palate came from a cold-start chip rather than from ratings.
  const lastSeed = [...events].reverse().find((event) => event.kind === 'cross_beverage_seed')
  const seededDrink =
    lastSeed && lastSeed.kind === 'cross_beverage_seed'
      ? (coldStartChips().find((chip) => chip.descriptor === lastSeed.descriptor)?.name ?? null)
      : null
  const shownRecommendations = stage === 'read' ? recommendations : recommendations.slice(0, 3)

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
      sketch: row
        ? FLAVOR_AXES.map((axis) => ({ axis, label: tAxis(`${axis}.label`), value: row[axis] }))
        : null,
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
      <TabHeader>
        <section className="flex flex-col gap-1" data-testid="palate-header">
          <h1 className="text-tab-title font-medium text-ink" data-testid="palate-title">
            {title}
          </h1>
          <p className="text-subtle text-ash-600" data-testid="palate-meta">
            {meta}
          </p>
        </section>
      </TabHeader>

      {session.kind === 'unavailable' && (
        <section data-testid="profile-unavailable">
          <p className="max-w-prose text-body text-ash-600">{t('unavailableBody')}</p>
        </section>
      )}

      {stage !== 'read' && (
        <div className="flex flex-col gap-5" data-testid="palate-early">
          {canRate && (
            <div className="flex flex-col gap-2">
              <PalateProgress ratingCount={ratingCount} label={t('progressLabel')} />
              <p className="text-meta text-ash-600" data-testid="palate-progress-line">
                {t('progressLine', { count: Math.max(0, 3 - ratingCount) })}
              </p>
            </div>
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

      {shownRecommendations.length > 0 && (
        <section className="flex flex-col gap-2" data-testid="profile-recommendations">
          {/* v1.5 §12: the Sakenowa credit folds into the label row, at the
              right, in §17's caption style — this list's attribution. */}
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-section-label uppercase text-ash-600">{t('recommendedHeading')}</h2>
            <SakenowaAttributionView
              placement="end"
              poweredBy={tAttribution('poweredBy')}
              linkLabel={tAttribution('linkLabel')}
              className="shrink-0 text-[11px]"
            />
          </div>
          <p className="text-meta text-ash-600" data-testid="profile-recommendations-lead">
            {seededDrink && stage !== 'read' ? t('closestToDrink', { drink: seededDrink }) : t('closestToPalate')}
          </p>
          <ul className="flex flex-col gap-2" role="list">
            {shownRecommendations.map((rec) => {
              const lean = palateLean(rec)
              const first = tAxis(`${lean.top}.label`)
              const second = tAxis(`${lean.second}.label`)
              return (
                <li key={rec.brandId}>
                  <Link
                    href={{ pathname: '/sake/[brandId]', params: { brandId: String(rec.brandId) } }}
                    data-testid={`recommendation-${rec.brandId}`}
                    className="flex flex-col gap-1 rounded-xl bg-surface px-4 py-3 shadow-yw-sm transition-colors hover:bg-ash-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ginshu-600"
                  >
                    {/* Only what we know: the name, brewery, prefecture and
                        the chart's axes — no photo, grade or price (v1.5). */}
                    <span className="flex flex-wrap items-baseline gap-x-2">
                      <span className="text-card-heading font-medium text-ink" lang={rec.nameRomaji ? 'en' : 'ja'}>
                        {rec.nameRomaji ?? rec.nameJa}
                      </span>
                      {rec.nameRomaji && (
                        <span className="text-meta text-ash-600" lang="ja">
                          {rec.nameJa}
                        </span>
                      )}
                    </span>
                    {(rec.brewery || rec.prefecture) && (
                      <span className="text-meta text-ash-600">
                        {[rec.brewery, rec.prefecture].filter(Boolean).join(' · ')}
                      </span>
                    )}
                    <span className="text-subtle text-ash-700">
                      {seededDrink && stage !== 'read'
                        ? t('reasonDrink', { drink: seededDrink, first: first.toLocaleLowerCase(locale), second: second.toLocaleLowerCase(locale) })
                        : t('reasonPalate', { first: first.toLocaleLowerCase(locale), second: second.toLocaleLowerCase(locale) })}
                    </span>
                    <span className="mt-0.5 flex gap-1.5">
                      {[first, second].map((word) => (
                        <span key={word} className="inline-flex min-h-6 items-center rounded-full bg-ash-200 px-2 text-[11px] text-ash-700">
                          {word}
                        </span>
                      ))}
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
        </section>
      )}
    </main>
  )
}
