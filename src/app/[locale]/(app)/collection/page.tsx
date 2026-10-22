import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { auth } from '@clerk/nextjs/server'
import { hasLocale } from 'next-intl'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { notFound } from 'next/navigation'
import { Camera, Keyboard } from '@phosphor-icons/react/dist/ssr'
import { Link } from '@/i18n/navigation'
import { CellarList } from '@/components/collection/cellar-list'
import { JournalFilters } from '@/components/collection/journal-filters'
import { JournalList } from '@/components/collection/journal-list'
import { TabPlaceholder } from '@/components/layout/tab-placeholder'
import { readSampleJournal, wantsSampleCollection } from '@/lib/demo/sample-mode'
import { TabHeader } from '@/components/layout/screen-header'
import { currentUserIsMaintainer } from '@/lib/auth/maintainer'
import { isLaunched } from '@/i18n/launch-state'
import { routing } from '@/i18n/routing'
import { RememberCollectionSegment } from '@/components/collection/remember-collection-segment'
import { SaveOfflineCopy } from '@/components/offline/save-offline-copy'
import { toOfflineCopy } from '@/lib/offline/collection-copy'
import { getCellarStore } from '@/lib/collection/get-cellar-store'
import { getExpressionStore } from '@/lib/collection/get-expression-store'
import { lookupJournalFacts } from '@/lib/collection/journal-facts'
import { filterJournal, journalFacetsUnder, parseJournalFilter } from '@/lib/collection/journal-filter'
import type { Expression } from '@/lib/schemas/expression'
import {
  COLLECTION_SEGMENT_COOKIE,
  type CollectionSegment,
  parseCollectionSegment,
  pickCollectionSegment,
} from '@/lib/collection/segment'
import type { CellarBottle } from '@/lib/schemas/cellar-bottle'
import type { JournalEntry } from '@/lib/schemas/journal-entry'
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
type Segment = CollectionSegment

type CookieJar = Awaited<ReturnType<typeof cookies>>

/**
 * Decide the maintainer branch. Kept out of the component body so the impure
 * `Date.now()` read isn't in the render path — the non-prod
 * `yawaragi_journal_stub` seam also stands in for the maintainer check + store
 * so the E2E needs no Clerk session and no Upstash.
 */
async function resolveJournalView(cookieJar: CookieJar): Promise<{
  isMaintainer: boolean
  /** The sample collection, which nothing on this screen may change. */
  readOnly: boolean
  journal: MaintainerJournalState | null
  cellar: readonly CellarBottle[]
  /** The bottlings the visitor added, for the journal's grade, style and koji filters. */
  expressions: readonly Expression[]
  /** The instant the cellar's "open N days" is measured against. */
  now: number
  /** Who the offline copy is saved for; absent when nothing may be saved (the sample). */
  copyOwner?: string | null
}> {
  const journalStub =
    process.env.NODE_ENV !== 'production'
      ? cookieJar.get('yawaragi_journal_stub')?.value
      : undefined
  if (journalStub != null) {
    return {
      isMaintainer: true,
      readOnly: false,
      journal: resolveJournalStub(journalStub),
      cellar: resolveCellarStub(journalStub),
      expressions: [],
      now: STUB_JOURNAL_NOW,
      copyOwner: null,
    }
  }
  const now = Date.now()
  if (!(await currentUserIsMaintainer())) {
    if (wantsSampleCollection(cookieJar)) {
      const sample = await readSampleJournal(now)
      return {
        isMaintainer: true,
        readOnly: true,
        journal: sample.journal,
        cellar: sample.cellar,
        expressions: sample.expressions,
        now,
      }
    }
    return { isMaintainer: false, readOnly: false, journal: null, cellar: [], expressions: [], now }
  }
  const { userId } = await auth()
  const cellarStore = getCellarStore()
  const expressionStore = getExpressionStore()
  const [journal, cellar, expressions] = await Promise.all([
    resolveMaintainerJournal({ store: getJournalStore(), userId, now }),
    userId && cellarStore ? cellarStore.read(userId) : Promise.resolve([]),
    // Only for the filters: a store that fails leaves them without grades,
    // never the journal without its list.
    userId && expressionStore ? expressionStore.read(userId).catch(() => []) : Promise.resolve([]),
  ])
  return { isMaintainer: true, readOnly: false, journal, cellar, expressions, now, copyOwner: userId }
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params
  if (!hasLocale(routing.locales, locale)) return {}
  const t = await getTranslations({ locale, namespace: 'collection' })
  return { title: `${t('title')} | Yawaragi` }
}

export default async function CollectionTabPage({ params, searchParams }: PageProps) {
  const { locale } = await params
  const query = await searchParams
  const tabParam = query.tab

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
  // The segment a link names, else the one this visitor was last on, else
  // Journal (design v1.5, #369).
  const segment: Segment = pickCollectionSegment(tabParam, cookieJar.get(COLLECTION_SEGMENT_COOKIE)?.value)
  const view = await resolveJournalView(cookieJar)

  if (!view.isMaintainer || !view.journal) {
    // Still scaffolding, still honest: ADR-0020 keeps the journal
    // maintainer-only, so there is nothing of the visitor's to list yet.
    const tPlaceholder = await getTranslations({ locale, namespace: 'tabPlaceholder.collection' })
    const tCollection = await getTranslations({ locale, namespace: 'collection' })
    return (
      // The tab's own header (v1.5) — title beside the avatar — above the
      // placeholder, so Account is reachable from here as from every tab.
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-5 py-6">
        <TabHeader>
          <h1 className="text-tab-title font-medium text-ink">{tCollection('title')}</h1>
        </TabHeader>
        <TabPlaceholder
          title={tPlaceholder('title')}
          body={tPlaceholder('body')}
          link={{ href: '/profile', label: tPlaceholder('linkLabel') }}
          sample={{
            href: `/api/sample-collection?locale=${locale}`,
            label: (await getTranslations({ locale, namespace: 'sampleCollection' }))('enter'),
          }}
        />
      </div>
    )
  }

  const t = await getTranslations('collection')
  const journal = view.journal
  // Design question Z: the read-only copy for when Collection cannot load.
  const offlineCopy =
    view.copyOwner !== undefined && journal.kind !== 'unavailable'
      ? toOfflineCopy(journal.kind === 'journal' ? journal.entries : [], view.cellar, view.copyOwner, view.now)
      : null

  return (
    <main
      className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-5 py-6"
      data-testid="collection-page"
    >
      {/* §11's title is the tab's name at 26px — the screen says where you are
          rather than what it contains, because the list below does that. */}
      <TabHeader>
        <h1 className="text-tab-title font-medium text-ink">{t('title')}</h1>
      </TabHeader>

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
            // Every segment link names its segment, so a tap on Journal wins
            // over a remembered Cellar.
            href={{ pathname: '/collection', query: { tab: key } }}
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
      {/* Remember a segment the visitor chose, not one we fell back to. */}
      {parseCollectionSegment(tabParam) && <RememberCollectionSegment segment={segment} />}
      {offlineCopy && <SaveOfflineCopy copy={offlineCopy} />}

      {journal.kind === 'unavailable' ? (
        <section data-testid="journal-unavailable">
          <p className="max-w-prose text-body text-ash-600">{t('unavailableBody')}</p>
        </section>
      ) : segment === 'cellar' ? (
        <>
          <CellarList rows={view.cellar} now={view.now} readOnly={view.readOnly} />
          {/* ADR-0014: the Sakenowa credit is line 1 of the end-of-screen
              block, rendered by the app shell directly under this list. */}
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
          <FilteredJournal entries={journal.entries} expressions={view.expressions} query={query} locale={locale} />
          {/* ADR-0014: the Sakenowa credit is line 1 of the end-of-screen
              block, rendered by the app shell directly under this list. */}
        </>
      )}
    </main>
  )
}

/**
 * The journal with design question W's filters over it: chips for what this
 * journal holds, the list narrowed to the filter in the URL, and a line when
 * nothing is left.
 */
async function FilteredJournal({
  entries,
  expressions,
  query,
  locale,
}: {
  entries: readonly JournalEntry[]
  expressions: readonly Expression[]
  query: Record<string, string | string[] | undefined>
  locale: string
}) {
  const filter = parseJournalFilter(query)
  const factsOf = await lookupJournalFacts(entries, expressions)
  const shown = filterJournal(entries, factsOf, filter)
  const t = await getTranslations('collection.filters')
  return (
    <>
      <JournalFilters
        filter={filter}
        facets={journalFacetsUnder(entries, factsOf, filter)}
        shown={shown.length}
        total={entries.length}
      />
      {shown.length > 0 ? (
        <JournalList entries={shown} locale={locale} />
      ) : (
        <p className="max-w-prose text-body text-ash-600" data-testid="journal-filter-none">
          {t('none')}
        </p>
      )}
    </>
  )
}
