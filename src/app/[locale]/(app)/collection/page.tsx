import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { auth } from '@clerk/nextjs/server'
import { hasLocale } from 'next-intl'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { notFound } from 'next/navigation'
import { Camera, Keyboard } from '@phosphor-icons/react/dist/ssr'
import { Link } from '@/i18n/navigation'
import { CellarList } from '@/components/collection/cellar-list'
import { JournalList } from '@/components/collection/journal-list'
import { TabPlaceholder } from '@/components/layout/tab-placeholder'
import { SakenowaAttribution } from '@/components/sake/sakenowa-attribution'
import { currentUserIsMaintainer } from '@/lib/auth/maintainer'
import { isLaunched } from '@/i18n/launch-state'
import { routing } from '@/i18n/routing'
import { getCellarStore } from '@/lib/collection/get-cellar-store'
import type { CellarBottle } from '@/lib/schemas/cellar-bottle'
import { getJournalStore } from '@/lib/taste/get-journal-store'
import { STUB_JOURNAL_NOW, resolveCellarStub, resolveJournalStub } from '@/lib/taste/journal-stub'
import {
  type MaintainerJournalState,
  resolveMaintainerJournal,
} from '@/lib/taste/resolve-maintainer-journal'

/**
 * §11 Collection — the Journal and Cellar segments. Reference screenshots 19, 20.
 *
 * **This is where the journal was always supposed to live.** It was rendered by
 * `/profile`, from an early return ahead of everything else, which made one
 * route serve two screens: a maintainer got the journal and could therefore
 * never see §12's Palate at all — the only visitor with real tastings was the
 * one visitor shut out of the view derived from them. Moving it here fixes the
 * information architecture and, incidentally, makes §12 reachable.
 *
 * §11 is three segments — Journal · Cellar · Wishlist. **Journal and Cellar
 * ship** (ADR-0024 puts the Cellar in Upstash beside the journal, so ADR-0011
 * does not block it); Wishlist is not built and is not offered, because an
 * option that leads nowhere is the dead affordance #162 forbids. The segment
 * is `?tab=cellar`, so the cellar notice's "View" can link straight to it.
 *
 * Who sees what: the journal is maintainer-only until the local-first rewrite
 * (ADR-0020, gated on ADR-0011), so everyone else still gets
 * `<TabPlaceholder />` — unchanged from before, and still the honest answer
 * while a visitor cannot have a journal at all.
 *
 * Age gating is the proxy's job: `/collection` is absent from
 * `UNGATED_LOCALE_PATHS`, which is deny-by-default, so a visitor who has not
 * accepted the 18+ gate never reaches this component. That matters more here
 * than on a placeholder — the list names sakes and shows ratings.
 */

interface PageProps {
  params: Promise<{ locale: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

/** §11's segments that have something behind them. Wishlist is not built. */
type Segment = 'journal' | 'cellar'

type CookieJar = Awaited<ReturnType<typeof cookies>>

/**
 * Decide the maintainer branch. Kept out of the component body so the impure
 * `Date.now()` read isn't in the render path — the non-prod
 * `yawaragi_journal_stub` seam also stands in for the maintainer check + store
 * so the E2E needs no Clerk session and no Upstash.
 */
async function resolveJournalView(cookieJar: CookieJar): Promise<{
  isMaintainer: boolean
  journal: MaintainerJournalState | null
  cellar: readonly CellarBottle[]
  /** The instant the cellar's "open N days" is measured against. */
  now: number
}> {
  const journalStub =
    process.env.NODE_ENV !== 'production'
      ? cookieJar.get('yawaragi_journal_stub')?.value
      : undefined
  if (journalStub != null) {
    return {
      isMaintainer: true,
      journal: resolveJournalStub(journalStub),
      cellar: resolveCellarStub(journalStub),
      now: STUB_JOURNAL_NOW,
    }
  }
  const now = Date.now()
  if (!(await currentUserIsMaintainer())) {
    return { isMaintainer: false, journal: null, cellar: [], now }
  }
  const { userId } = await auth()
  const cellarStore = getCellarStore()
  const [journal, cellar] = await Promise.all([
    resolveMaintainerJournal({ store: getJournalStore(), userId, now }),
    userId && cellarStore ? cellarStore.read(userId) : Promise.resolve([]),
  ])
  return { isMaintainer: true, journal, cellar, now }
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params
  if (!hasLocale(routing.locales, locale)) return {}
  const t = await getTranslations({ locale, namespace: 'collection' })
  return { title: `${t('title')} | Yawaragi` }
}

export default async function CollectionTabPage({ params, searchParams }: PageProps) {
  const { locale } = await params
  const segment: Segment = (await searchParams).tab === 'cellar' ? 'cellar' : 'journal'

  if (!hasLocale(routing.locales, locale)) {
    notFound()
  }

  setRequestLocale(locale)

  // ADR-0008: the German surface is not launched, so a deep link renders the
  // same coming-soon block every other gated route does.
  if (!isLaunched(locale)) {
    const tComingSoon = await getTranslations({ locale, namespace: 'comingSoon' })
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-5 py-6" data-testid="coming-soon">
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

  const cookieJar = await cookies()
  const view = await resolveJournalView(cookieJar)

  if (!view.isMaintainer || !view.journal) {
    // Still scaffolding, still honest: ADR-0020 keeps the journal
    // maintainer-only, so there is nothing of the visitor's to list yet.
    const tPlaceholder = await getTranslations({ locale, namespace: 'tabPlaceholder.collection' })
    return (
      <TabPlaceholder
        title={tPlaceholder('title')}
        body={tPlaceholder('body')}
        link={{ href: '/profile', label: tPlaceholder('linkLabel') }}
      />
    )
  }

  const t = await getTranslations('collection')
  const journal = view.journal

  return (
    <main
      className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-5 py-6"
      data-testid="collection-page"
    >
      {/* §11's title is the tab's name at 26px — the screen says where you are
          rather than what it contains, because the list below does that. */}
      <h1 className="text-tab-title font-medium text-ink">{t('title')}</h1>

      {/* §11's segmented control, minus Wishlist (not built — a third
          option leading nowhere is the dead affordance #162 forbids). Plain
          links with a `?tab=`, so the segment is a URL: "View" on the cellar
          notice can land on it, and it works before hydration. */}
      <nav
        aria-label={t('sectionsLabel')}
        // §11 / screenshot 20: a compact group on the left, not a full-width
        // pill; the current segment in the accent outline.
        className="flex self-start rounded-lg border border-divider"
        data-testid="collection-segments"
      >
        {(['journal', 'cellar'] as const).map((key) => (
          <Link
            key={key}
            href={key === 'journal' ? '/collection' : { pathname: '/collection', query: { tab: key } }}
            aria-current={segment === key ? 'page' : undefined}
            className={
              segment === key
                ? '-m-px flex min-h-9 items-center rounded-lg border border-ginshu-500 bg-ginshu-100 px-3.5 text-subtle font-medium text-ginshu-700'
                : 'flex min-h-9 items-center px-3.5 text-subtle text-ink transition-colors hover:text-ginshu-700'
            }
            data-testid={`collection-segment-${key}`}
          >
            {t(key === 'journal' ? 'segmentJournal' : 'segmentCellar')}
          </Link>
        ))}
      </nav>

      {journal.kind === 'unavailable' ? (
        <section data-testid="journal-unavailable">
          <p className="max-w-prose text-body text-ash-600">{t('unavailableBody')}</p>
        </section>
      ) : segment === 'cellar' ? (
        <>
          <CellarList rows={view.cellar} now={view.now} />
          {/* ADR-0014: cellar rows name Sakenowa brands too. */}
          {view.cellar.length > 0 && <SakenowaAttribution placement="end" />}
        </>
      ) : journal.kind === 'empty' ? (
        // §11's empty journal: "Your journal starts with one star" and a way
        // to the star — a scan, or §8 for a visitor without the bottle to hand.
        <section className="flex flex-col gap-3" data-testid="journal-empty">
          <h2 className="text-card-heading font-medium text-ink">{t('emptyHeading')}</h2>
          <p className="max-w-prose text-body text-ash-600">{t('emptyBody')}</p>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/scan"
              className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-ginshu-400 px-4 text-body font-medium text-ginshu-700 transition-colors hover:bg-ginshu-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ginshu-600"
              data-testid="journal-empty-scan"
            >
              <Camera size={17} aria-hidden="true" />
              {t('emptyScan')}
            </Link>
            <Link
              href="/search"
              className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-ash-300 px-4 text-body font-medium text-ink transition-colors hover:bg-ash-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ginshu-600"
              data-testid="journal-empty-type-it"
            >
              <Keyboard size={17} aria-hidden="true" />
              {t('emptyTypeIt')}
            </Link>
          </div>
        </section>
      ) : (
        <>
          <JournalList entries={journal.entries} locale={locale} />
          {/* ADR-0014: the list renders Sakenowa brand names, so the credit
              rides on this surface. Inline, because Sakenowa is one source
              among the visitor's own notes and ratings. */}
          <SakenowaAttribution placement="end" />
        </>
      )}
    </main>
  )
}
