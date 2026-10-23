import type { Metadata } from 'next'
import { hasAcceptedAgeGate } from '@/lib/legal/age-gate-cookie'
import { cookies } from 'next/headers'
import { hasLocale } from 'next-intl'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { notFound } from 'next/navigation'
import { CaretRight } from '@phosphor-icons/react/dist/ssr'
import { OpenTheApp } from '@/components/learn/open-the-app'
import { Link } from '@/i18n/navigation'
import { routing } from '@/i18n/routing'
import { guideEntriesIn } from '@/lib/guide/entries'
import { GUIDE_GROUPS, type GuideEntry } from '@/lib/schemas/guide-entry'

/**
 * "Learn" — the index of the reference on what a label and a bottle mean
 * (design v1.6 §18, screenshot 58; ADR-0026).
 *
 * **Public.** It sits in `(site)`, outside the app shell and outside the 18+
 * gate: these pages carry no brand, flavor or recommendation data, only
 * hand-written explanations with their sources (ADR-0026 records the
 * decision). So there is no tab bar, no Sakenowa credit, and the way into the
 * product is one "Open the app" link, which the gate then answers.
 *
 * A "Start here" card, then the groups in a fixed order. Each row is the
 * entry's title, its Japanese, and the short answer the entry itself opens
 * with — never clamped, because German runs about a third longer.
 */
interface PageProps {
  params: Promise<{ locale: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params
  if (!hasLocale(routing.locales, locale)) return {}
  const t = await getTranslations({ locale, namespace: 'learn' })
  return { title: t('metaTitle'), description: t('metaDescription') }
}

export default async function LearnIndexPage({ params }: PageProps) {
  const { locale } = await params
  if (!hasLocale(routing.locales, locale)) notFound()
  setRequestLocale(locale)
  const t = await getTranslations('learn')

  const [start] = guideEntriesIn('start')
  const groups = GUIDE_GROUPS.filter((group) => group !== 'start')

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-7 px-5 py-6" data-testid="learn-index">
      <div className="flex flex-col gap-2">
        <div className="flex items-start justify-between gap-4">
          <h1 className="text-[26px] font-medium leading-tight text-ink">{t('title')}</h1>
          <OpenTheApp label={hasAcceptedAgeGate(await cookies()) ? t('backToApp') : t('openApp')} />
        </div>
        <p className="text-body text-ash-700">{t('lead')}</p>
      </div>

      {start && (
        <Link
          href={{ pathname: '/learn/[slug]', params: { slug: start.slug } }}
          className="flex items-center gap-3 rounded-xl bg-surface p-4 shadow-yw-sm transition-colors hover:bg-ash-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ginshu-600"
          data-testid="learn-start-here"
        >
          <span className="flex min-w-0 flex-1 flex-col gap-1.5">
            <span className="border-l-2 border-ginshu-500 pl-2 text-section-label uppercase text-ash-600">
              {t('startHere')}
            </span>
            <span className="text-md-alt font-medium text-ink">{t(`entries.${start.slug}.title`)}</span>
            <span className="text-subtle leading-normal text-ash-700">
              {t(`entries.${start.slug}.answer`)}
            </span>
          </span>
          <CaretRight size={16} className="shrink-0 text-ash-600" aria-hidden="true" />
        </Link>
      )}

      {groups.map((group) => (
        <section key={group} className="flex flex-col" aria-labelledby={`learn-group-${group}`}>
          <h2 id={`learn-group-${group}`} className="text-section-label uppercase text-ash-600">
            {t(`groups.${group}`)}
          </h2>
          <ul className="flex flex-col" role="list">
            {guideEntriesIn(group).map((entry) => (
              <IndexRow key={entry.slug} entry={entry} />
            ))}
          </ul>
        </section>
      ))}
    </main>
  )
}

async function IndexRow({ entry }: { entry: GuideEntry }) {
  const t = await getTranslations('learn')
  return (
    <li className="border-b border-divider">
      <Link
        href={{ pathname: '/learn/[slug]', params: { slug: entry.slug } }}
        className="flex min-h-14 items-center gap-3 py-3 transition-colors hover:bg-ash-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ginshu-600"
        data-testid={`learn-row-${entry.slug}`}
      >
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="flex flex-wrap items-baseline gap-x-2">
            <span className="text-card-heading font-medium text-ink">
              {t(`entries.${entry.slug}.title` as 'entries.junmai.title')}
            </span>
            {entry.kanji && (
              <span className="text-meta text-ash-600" lang="ja">
                {entry.kanji}
              </span>
            )}
          </span>
          <span className="text-meta leading-normal text-ash-700">
            {t(`entries.${entry.slug}.answer` as 'entries.junmai.answer')}
          </span>
        </span>
        <CaretRight size={16} className="shrink-0 text-ash-600" aria-hidden="true" />
      </Link>
    </li>
  )
}
