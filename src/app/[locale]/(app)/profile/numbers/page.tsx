import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { hasLocale } from 'next-intl'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { notFound, redirect } from 'next/navigation'
import { ScreenBar } from '@/components/layout/screen-header'
import { JournalNumbersScreen } from '@/components/palate/journal-numbers'
import { getPathname } from '@/i18n/navigation'
import { isLaunched } from '@/i18n/launch-state'
import { routing } from '@/i18n/routing'
import { lookupBottleFacts, lookupJournalFacts } from '@/lib/collection/journal-facts'
import { journalNumbers } from '@/lib/collection/journal-stats'
import { bottlesKept, whatStandsOut } from '@/lib/collection/what-stands-out'
import { resolveViewerJournal } from '@/lib/taste/resolve-viewer-journal'

/**
 * "Your sake in numbers" (design v1.9, X; 123, 124 — renamed in v1.10, AB1;
 * 129, 130): counts, "What stands out", the tile map of prefectures, the
 * stars, the breweries rated highest, the grades, "Bottles you've kept" and
 * the surprise — the visitor's own journal and bottle history, worked out on
 * request, shown only to them. Reached from Palate's row; with fewer than five tastings (or no
 * journal) there is nothing to show, and the address goes back to Palate.
 *
 * Age-gated by the proxy like every app route: it names sakes and shows
 * ratings.
 */
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params
  if (!hasLocale(routing.locales, locale)) return {}
  const t = await getTranslations({ locale, namespace: 'palate.numbers' })
  return { title: `${t('heading')} | Yawaragi` }
}

export default async function JournalNumbersPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  if (!hasLocale(routing.locales, locale)) notFound()
  setRequestLocale(locale)
  const palate = getPathname({ locale, href: '/profile' })
  if (!isLaunched(locale)) redirect(palate)

  const journal = await resolveViewerJournal(await cookies())
  if (!journal) redirect(palate)
  const [factsOf, bottleFactsOf] = await Promise.all([
    lookupJournalFacts(journal.entries, journal.expressions),
    lookupBottleFacts(journal.history, journal.expressions),
  ])
  const numbers = journalNumbers(journal.entries, factsOf, journal.profile)
  if (!numbers) redirect(palate)
  const standsOut = whatStandsOut({ entries: journal.entries, factsOf, events: journal.history, bottleFactsOf })
  const kept = bottlesKept(journal.history, bottleFactsOf)

  const t = await getTranslations('palate.numbers')
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-5 py-4" data-testid="journal-numbers-page">
      <ScreenBar title={t('heading')} titleAs="h1" backFallbackHref={palate} />
      <JournalNumbersScreen numbers={numbers} standsOut={standsOut} kept={kept} />
    </main>
  )
}
