import type { Metadata } from 'next'
import { hasLocale } from 'next-intl'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { notFound } from 'next/navigation'
import { CaretRight } from '@phosphor-icons/react/dist/ssr'
import { ScreenBar } from '@/components/layout/screen-header'
import { Link, getPathname } from '@/i18n/navigation'
import { routing } from '@/i18n/routing'
import { appVersion } from '@/lib/app/app-version'

/**
 * "About Yawaragi" — design v1.10, AA5 (screenshot 137). Account → Help →
 * About: what the app is, where its data comes from, how a label is read,
 * what is open source, and which build this is (AA6).
 *
 * Behind the 18+ gate like the rest of Account (`/account/about` is not in
 * `UNGATED_LOCALE_PATHS`, which is deny-by-default). The landing is for
 * people deciding; this page is for people using the app.
 *
 * Every sentence has to be true of today's code, so two lines differ from
 * the design:
 * - "Reading labels" says the photo is discarded once read, without the
 *   design's "unless you keep it": kept photos (v1.8 I) are not built.
 *   It also leaves out "Which service reads it is named in the privacy
 *   notice", because the privacy notice does not name it yet.
 * - "Open source" describes the MCP server for what it is, without "Yawaragi
 *   uses it to search the catalogue": only the Ask surface calls it, and
 *   Ask is off in v1.
 *
 * The end-of-screen block is the app shell's `<LegalFooter credit />`, as on
 * every app screen; the prototype draws the Sakenowa credit line here too.
 */
interface PageProps {
  params: Promise<{ locale: string }>
}

const SAKENOWA_URL = 'https://sakenowa.com'
const SAKENOWA_MCP_URL = 'https://github.com/yawaragi-dev/sakenowa-mcp'

const LINK_CLASS_NAME =
  'rounded-sm text-ginshu-700 hover:text-ginshu-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ginshu-600'

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params
  if (!hasLocale(routing.locales, locale)) return {}
  const t = await getTranslations({ locale, namespace: 'about' })
  return { title: `${t('title')} | Yawaragi` }
}

export default async function AboutPage({ params }: PageProps) {
  const { locale } = await params
  if (!hasLocale(routing.locales, locale)) notFound()
  setRequestLocale(locale)

  const t = await getTranslations('about')
  const { version, build } = appVersion()

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-5 py-6" data-testid="about-page">
      <ScreenBar
        titleAs="h1"
        title={t('title')}
        backFallbackHref={getPathname({ locale, href: '/account' })}
      />

      {/* The 和 mark and the name, then one paragraph. */}
      <section className="flex flex-col gap-2">
        <p className="flex items-baseline gap-2.5" aria-hidden="true">
          <span lang="ja" className="text-tab-title leading-none text-ginshu-600">
            和
          </span>
          <span className="text-bottle-name font-medium text-ink">Yawaragi</span>
        </p>
        <p className="text-body leading-relaxed text-ash-800" data-testid="about-intro">
          {t('intro')}
        </p>
      </section>

      <section className="flex flex-col" data-testid="about-data-sources">
        <h2 className="mb-1 text-section-label uppercase text-ash-600">{t('dataHeading')}</h2>
        <SourceRow name={t('sakenowaName')}>
          {t('sakenowaBody')}{' '}
          <a
            href={SAKENOWA_URL}
            target="_blank"
            rel="noopener noreferrer"
            className={`${LINK_CLASS_NAME} whitespace-nowrap`}
            data-testid="about-sakenowa-link"
          >
            {t('sakenowaLink')} ↗<span className="sr-only"> {t('newTab')}</span>
          </a>
        </SourceRow>
        <SourceRow name={t('ntaName')}>{t('ntaBody')}</SourceRow>
        {/* The design's "Sake guide" is this app's "Learn" (ADR-0026). */}
        <Link
          href="/learn"
          className="flex items-center gap-3 border-b border-divider py-2.5 transition-colors hover:bg-ash-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ginshu-600"
          data-testid="about-learn-link"
        >
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="text-body text-ink">{t('learnName')}</span>
            <span className="text-meta leading-normal text-ash-700">{t('learnBody')}</span>
          </span>
          <CaretRight size={16} className="shrink-0 text-ash-600" aria-hidden="true" />
        </Link>
      </section>

      <section className="flex flex-col gap-1.5">
        <h2 className="text-section-label uppercase text-ash-600">{t('readingHeading')}</h2>
        <p className="text-subtle leading-relaxed text-ash-800" data-testid="about-reading">
          {t('readingBody')}
        </p>
      </section>

      <section className="flex flex-col gap-1.5">
        <h2 className="text-section-label uppercase text-ash-600">{t('openSourceHeading')}</h2>
        <p className="text-subtle leading-relaxed text-ash-800">
          {t('openSourceBody')}{' '}
          <a
            href={SAKENOWA_MCP_URL}
            target="_blank"
            rel="noopener noreferrer"
            className={`${LINK_CLASS_NAME} whitespace-nowrap`}
            data-testid="about-source-code-link"
          >
            {t('openSourceLink')} ↗<span className="sr-only"> {t('newTab')}</span>
          </a>
        </p>
      </section>

      <section className="flex flex-col gap-2.5">
        <p className="flex items-baseline justify-between gap-2.5">
          <span className="text-body text-ink">{t('versionLabel')}</span>
          <span className="whitespace-nowrap text-subtle tabular-nums text-ash-700" data-testid="about-version">
            {t('versionValue', { version, build })}
          </span>
        </p>
        {/* TODO(design v1.10 AA2, open decision 20): the "Send feedback"
            button goes here, opening the feedback sheet — once it is decided
            where feedback messages are stored. No mailto stand-in: the
            Impressum address it would use is not set yet. */}
      </section>
    </main>
  )
}

function SourceRow({ name, children }: { name: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-divider py-2.5">
      <span className="text-body text-ink">{name}</span>
      <span className="text-meta leading-normal text-ash-700">{children}</span>
    </div>
  )
}
