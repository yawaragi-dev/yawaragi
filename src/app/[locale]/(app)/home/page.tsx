import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { auth } from '@clerk/nextjs/server'
import { hasLocale } from 'next-intl'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { notFound } from 'next/navigation'
import { Link } from '@/i18n/navigation'
import { ColdStartChips, type ColdStartChipView } from '@/components/palate/cold-start-chips'
import { HomeActionTiles } from '@/components/home/action-tiles'
import { HomeFirstRunCard } from '@/components/home/first-run-card'
import { HomeGreeting } from '@/components/home/greeting'
import { HomePalateStrip } from '@/components/home/palate-strip'
import { HomeRecentTastings } from '@/components/home/recent-tastings'
import { currentUserIsMaintainer } from '@/lib/auth/maintainer'
import { coldStartChips } from '@/lib/cross-beverage/cold-start-chips'
import { resolveCrossBeverageTarget } from '@/lib/cross-beverage/forward-lookup'
import { isDebugEnabledFromCookies } from '@/lib/debug/debug-mode'
import { isLaunched } from '@/i18n/launch-state'
import { routing } from '@/i18n/routing'
import { getJournalStore } from '@/lib/taste/get-journal-store'
import { STUB_JOURNAL_NOW, resolveJournalStub } from '@/lib/taste/journal-stub'
import {
  type MaintainerJournalState,
  resolveMaintainerJournal,
} from '@/lib/taste/resolve-maintainer-journal'
import { PALATE_READ_THRESHOLD, palateLean } from '@/lib/taste/palate-read'

/**
 * §3 Home — the app's front door. Reference screenshots 04 and 05.
 *
 * Three things stacked, in this order: the greeting, the action tiles, and
 * then either what you have been drinking or an explanation of what this is
 * for. The screen's job is to get you into the loop, so nothing on it is
 * information for its own sake.
 *
 * This replaces `<TabPlaceholder />`, which also means **§0's "Open the app"
 * goes back to `/home`**. It was retargeted to `/scan` because Home rendered
 * scaffolding, and the landing's only returning-visitor affordance landed on a
 * card telling you to go to the camera (#300). `landing-page.spec.ts` pins the
 * outcome — "lands on a built screen, not scaffolding" — rather than the
 * destination, so it keeps passing either way.
 *
 * **Recent tastings are maintainer-only**, like the journal they come from
 * (ADR-0020, gated on ADR-0011). Everyone else gets §3's first-run card, which
 * is the correct screen for them: they have no tastings, and that is exactly
 * what first-run means. The difference from the design is only *why* the list
 * is empty, which the visitor cannot see.
 *
 * Deviations, both recorded on #300:
 *
 * - **One action tile, not two.** §3's v1 layout is "Scan a label" at `1.6fr`
 *   beside "Type it" at `1fr`, and "Type it" opens §8 Search — which is #323,
 *   BLOCKED on #327. There is no `/search` route for it to open, and a tile
 *   that 404s is worse than a tile that is not there.
 * - **§3's first-run copy is adapted, not ported.** Two of its three steps
 *   describe saving a tasting with a star, which is Phase 2, and a journal
 *   with no account, which ADR-0020 does not allow yet. `<HomeFirstRunCard />`
 *   explains the substitution.
 */

interface PageProps {
  params: Promise<{ locale: string }>
}

type CookieJar = Awaited<ReturnType<typeof cookies>>

/** §3 shows three. "All {n} →" carries the real total. */
const RECENT_LIMIT = 3

/**
 * Decide the maintainer branch. Kept out of the component body so the impure
 * `Date.now()` read isn't in the render path — the non-prod
 * `yawaragi_journal_stub` seam also stands in for the maintainer check + store
 * so the E2E needs no Clerk session and no Upstash.
 */
async function resolveJournalView(cookieJar: CookieJar): Promise<{
  journal: MaintainerJournalState | null
  /**
   * The instant the recent-tasting ages are measured against.
   *
   * Read here and passed down rather than called in the component body:
   * `Date.now()` during render is an impure call, which the React compiler
   * rejects outright (`react-hooks/purity`) because a re-render would silently
   * produce different output. One read, one value, every age consistent with
   * every other.
   */
  now: number
}> {
  const now = Date.now()
  const journalStub =
    process.env.NODE_ENV !== 'production'
      ? cookieJar.get('yawaragi_journal_stub')?.value
      : undefined
  if (journalStub != null) {
    // The stub's entries are pinned to a fixed instant so a relative age is
    // not a test that rewrites its own expectations overnight.
    return { journal: resolveJournalStub(journalStub), now: STUB_JOURNAL_NOW }
  }
  if (!(await currentUserIsMaintainer())) return { journal: null, now }
  const { userId } = await auth()
  return {
    journal: await resolveMaintainerJournal({ store: getJournalStore(), userId, now }),
    now,
  }
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params
  if (!hasLocale(routing.locales, locale)) return {}
  const t = await getTranslations({ locale, namespace: 'home' })
  return { title: `${t('title')} | Yawaragi` }
}

export default async function HomeTabPage({ params }: PageProps) {
  const { locale } = await params

  if (!hasLocale(routing.locales, locale)) {
    notFound()
  }

  setRequestLocale(locale)

  // ADR-0008: the German surface is not launched, so a deep link renders the
  // same coming-soon block every other gated route does.
  if (!isLaunched(locale)) {
    const tComingSoon = await getTranslations({ locale, namespace: 'comingSoon' })
    return (
      <div
        className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-5 py-6"
        data-testid="coming-soon"
      >
        <h1 className="text-title font-medium text-ink">{tComingSoon('title')}</h1>
        <p className="max-w-prose text-body text-ash-600">{tComingSoon('body')}</p>
        <Link
          href="/"
          locale="en"
          className="w-fit text-body font-medium text-ginshu-700 underline underline-offset-4"
        >
          {tComingSoon('switchToEn')}
        </Link>
      </div>
    )
  }

  // Age gating is the proxy's job: `/home` is absent from
  // `UNGATED_LOCALE_PATHS`, and that list is deny-by-default, so a visitor who
  // has not accepted the 18+ gate never reaches this component. It matters
  // now that the screen names sakes and shows ratings.
  const cookieJar = await cookies()
  const debugMode = isDebugEnabledFromCookies(cookieJar)
  const { journal, now } = await resolveJournalView(cookieJar)
  const entries = journal?.kind === 'journal' ? journal.entries : []
  const profile = journal?.kind === 'journal' ? journal.profile : null

  const tAxis = await getTranslations('flavorAxis')
  const tPalate = await getTranslations('palate')

  const chips: ColdStartChipView[] = coldStartChips().map((chip) => {
    const row = resolveCrossBeverageTarget(chip.descriptor, chip.beverage)
    const lean = row ? palateLean(row) : null
    return {
      ...chip,
      seedLine: lean
        ? tPalate('coldStart.seedLine', {
            name: chip.name,
            first: tAxis(`${lean.top}.label`).toLocaleLowerCase(locale),
            second: tAxis(`${lean.second}.label`).toLocaleLowerCase(locale),
          })
        : tPalate('coldStart.seedLineUnknown', { name: chip.name }),
    }
  })

  return (
    <main
      className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-5 py-6"
      data-testid="home-page"
    >
      <HomeGreeting />
      <HomeActionTiles />

      {entries.length > 0 ? (
        <>
          <HomeRecentTastings
            entries={entries.slice(0, RECENT_LIMIT)}
            totalCount={entries.length}
            now={now}
          />
          {/* §3's palate strip, only once there is a palate to describe.
              §12's threshold decides that, and the lean is computed the same
              way §12's own title is, so the two screens cannot disagree. */}
          {profile && entries.length >= PALATE_READ_THRESHOLD && (
            <HomePalateStrip profile={profile} ratingCount={entries.length} />
          )}
        </>
      ) : (
        <>
          <HomeFirstRunCard />
          {/* §3: "Cross-beverage cold start below it — see §12." The same
              component §12 renders, not a second copy of it: one surface for
              the mandatory <HeuristicDisclaimer /> to live on, and one place
              where the chip list is decided. */}
          <ColdStartChips chips={chips} debugMode={debugMode} />
        </>
      )}

      {/* Nothing below. §3 ends here, and the tab bar is the bottom edge
          (rule 11) — a secondary link stack would be a second way to navigate
          competing with the one that is always there. */}
    </main>
  )
}
