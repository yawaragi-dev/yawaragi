import type { Metadata } from 'next'
import { hasLocale } from 'next-intl'
import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server'
import { notFound } from 'next/navigation'
import { ArrowSquareOut, ListBullets } from '@phosphor-icons/react/dist/ssr'
import { OpenTheApp } from '@/components/learn/open-the-app'
import { Link } from '@/i18n/navigation'
import { routing } from '@/i18n/routing'
import { GUIDE_SLUGS, type GuideSlug, guideEntry, isGuideSlug } from '@/lib/guide/entries'

/**
 * One "Learn" entry (design v1.6 §18, screenshots 59–61; ADR-0026).
 *
 * Its own page type, not a long info sheet: a sheet holds one caveat, an entry
 * has structure, links out, and has to be linkable and indexable. In §18's
 * order:
 *
 *   1. the group, the title, and the term in Japanese with its reading;
 *   2. **the answer** — two lines or so, the line the index quotes;
 *   3. **facts** — a titled list of term · value · note, with the Japanese
 *      beside the value;
 *   4. detail paragraphs;
 *   5. **the sources, always** — every fact here is hand-written from them
 *      (`manual_curation`), and the page says when it was last checked;
 *   6. related entries, in a row that scrolls sideways (rule 7).
 *
 * §18's item 8, "Sakes of this style", is not here: it is built from
 * catalogue bottlings, there are none, and it would sit behind the 18+ gate
 * in any case. So nothing on this page is catalogue data and it carries no
 * Sakenowa credit (rule 15).
 *
 * No fixed heights and no clamping anywhere: titles wrap, because German
 * runs about a third longer than English.
 */
interface PageProps {
  params: Promise<{ locale: string; slug: string }>
}

export function generateStaticParams() {
  return GUIDE_SLUGS.map((slug) => ({ slug }))
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale, slug } = await params
  if (!hasLocale(routing.locales, locale) || !isGuideSlug(slug)) return {}
  const t = await getTranslations({ locale, namespace: 'learn' })
  return {
    title: t('entryMetaTitle', { title: t(`entries.${slug}.title`) }),
    description: t(`entries.${slug}.answer`),
  }
}

export default async function LearnEntryPage({ params }: PageProps) {
  const { locale, slug } = await params
  if (!hasLocale(routing.locales, locale) || !isGuideSlug(slug)) notFound()
  setRequestLocale(locale)

  const entry = guideEntry(slug)
  const t = await getTranslations('learn')
  const format = await getFormatter()
  // The entry's own strings. Every key asked for below is checked against the
  // catalogue by `entries.test.ts`, so a missing one fails CI, not this page.
  const text = (key: string) => t(`entries.${slug}.${key}` as `entries.${GuideSlug}.title`)

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-5 py-6" data-testid="learn-entry">
      <div className="flex items-center justify-between gap-3">
        <Link
          href="/learn"
          className="-ml-1 flex min-h-11 items-center gap-1.5 rounded-md px-1 text-subtle font-medium text-ginshu-700 hover:text-ginshu-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ginshu-600"
          data-testid="learn-all-topics"
        >
          <ListBullets size={16} aria-hidden="true" />
          {t('allTopics')}
        </Link>
        <OpenTheApp label={t('openApp')} />
      </div>

      <header className="flex flex-col gap-1.5">
        <p className="text-section-label uppercase text-ash-600">{t(`groupKicker.${entry.group}`)}</p>
        <h1 className="text-balance text-[28px] font-medium leading-tight tracking-[-0.02em] text-ink">
          {text('title')}
        </h1>
        {entry.kanji && (
          <p className="flex flex-wrap items-baseline gap-x-2.5">
            <span className="text-md-alt text-ash-700" lang="ja" data-testid="learn-entry-kanji">
              {entry.kanji}
            </span>
            {entry.romaji && <span className="text-subtle italic text-ash-600">{entry.romaji}</span>}
          </p>
        )}
      </header>

      <p className="text-md-alt leading-normal text-ink" data-testid="learn-entry-answer">
        {text('answer')}
      </p>

      <section className="flex flex-col" aria-labelledby="learn-facts-title">
        <h2 id="learn-facts-title" className="pb-1 text-section-label uppercase text-ash-600">
          {text('factsTitle')}
        </h2>
        <dl className="flex flex-col" data-testid="learn-entry-facts">
          {entry.facts.map((fact) => (
            <div key={fact.id} className="flex gap-3 border-b border-divider py-3">
              <dt className="w-[104px] shrink-0 text-body font-medium text-ink">
                {text(`facts.${fact.id}.term`)}
              </dt>
              <dd className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="text-body text-ink">{text(`facts.${fact.id}.value`)}</span>
                {fact.kanji && (
                  <span className="flex flex-wrap items-baseline gap-x-2 text-subtle text-ash-700">
                    <span lang="ja">{fact.kanji}</span>
                    {fact.romaji && <span className="text-meta italic text-ash-600">{fact.romaji}</span>}
                  </span>
                )}
                {fact.note && (
                  <span className="text-meta leading-normal text-ash-700">
                    {text(`facts.${fact.id}.note`)}
                  </span>
                )}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      {entry.paragraphs > 0 && (
        <div className="flex flex-col gap-3" data-testid="learn-entry-detail">
          {Array.from({ length: entry.paragraphs }, (_, i) => (
            <p key={i} className="text-body leading-relaxed text-ash-800">
              {text(`detail.p${i + 1}`)}
            </p>
          ))}
        </div>
      )}

      <section className="flex flex-col gap-1.5" data-testid="learn-entry-sources">
        <h2 className="text-section-label uppercase text-ash-600">
          {entry.sources.length === 1 ? t('sourceLabel') : t('sourcesLabel')}
        </h2>
        <ul className="flex flex-col gap-1.5" role="list">
          {entry.sources.map((source) => (
            <li key={source.url} className="text-meta leading-normal text-ash-700">
              <a
                href={source.url}
                target="_blank"
                rel="noopener noreferrer"
                className="underline decoration-ash-500 underline-offset-4 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ginshu-600"
              >
                {source.label}
                <ArrowSquareOut size={12} className="ml-1 inline align-baseline" aria-hidden="true" />
              </a>
            </li>
          ))}
        </ul>
        <p className="text-meta text-ash-600">
          {t('checked', {
            date: format.dateTime(new Date(`${entry.verifiedOn}T00:00:00Z`), {
              dateStyle: 'long',
              timeZone: 'UTC',
            }),
          })}
        </p>
      </section>

      {entry.related.length > 0 && (
        <section className="flex flex-col gap-2" aria-labelledby="learn-related-title">
          <h2 id="learn-related-title" className="text-section-label uppercase text-ash-600">
            {t('related')}
          </h2>
          {/* Rule 7: the row scrolls sideways, the page does not. */}
          <ul className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1" role="list" data-testid="learn-entry-related">
            {entry.related.map((relatedSlug) => {
              const related = guideEntry(relatedSlug as GuideSlug)
              return (
                <li key={relatedSlug} className="shrink-0">
                  <Link
                    href={{ pathname: '/learn/[slug]', params: { slug: relatedSlug } }}
                    className="flex min-h-14 max-w-56 flex-col justify-center gap-0.5 rounded-lg bg-surface px-3 py-2 shadow-yw-sm transition-colors hover:bg-ash-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ginshu-600"
                  >
                    <span className="text-subtle font-medium text-ink">
                      {t(`entries.${relatedSlug}.title` as `entries.${GuideSlug}.title`)}
                    </span>
                    {related.kanji && (
                      <span className="text-section-label text-ash-600" lang="ja">
                        {related.kanji}
                      </span>
                    )}
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
