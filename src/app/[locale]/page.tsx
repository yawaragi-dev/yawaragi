import { cookies } from 'next/headers'
import { getTranslations } from 'next-intl/server'
import { Link } from '@/i18n/navigation'
import { LocaleSwitcher } from '@/components/layout/locale-switcher'
import { AgeGate } from '@/components/legal/age-gate'
import { hasAcceptedAgeGate } from '@/lib/legal/age-gate-cookie'

// Per ADR-0008, only `en` is publicly launched. `de` shows a coming-soon page
// until the Impressum (§5 TMG) and DE privacy copy are in place.
const LAUNCHED_LOCALES = new Set(['en'])

export default async function LandingPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params

  if (!LAUNCHED_LOCALES.has(locale)) {
    return <ComingSoonPage />
  }

  const t = await getTranslations('landing')
  const cookieJar = await cookies()
  const gateAccepted = hasAcceptedAgeGate(cookieJar)

  return (
    <div className="flex flex-col flex-1 bg-zinc-50 font-sans dark:bg-black">
      <header className="flex justify-end px-6 py-4">
        <LocaleSwitcher />
      </header>
      <main className="flex flex-1 w-full max-w-3xl mx-auto flex-col gap-12 py-16 px-8">
        <section className="flex flex-col gap-4">
          <h1 className="text-4xl font-semibold leading-tight tracking-tight">
            {t('title')}
          </h1>
          <p className="text-xl text-zinc-700 dark:text-zinc-300">
            {t('tagline')}
          </p>
          <p className="text-base text-zinc-600 dark:text-zinc-400 max-w-prose">
            {t('intro')}
          </p>
        </section>

        <section className="grid gap-8 sm:grid-cols-3">
          <article className="flex flex-col gap-2">
            <h2 className="text-lg font-medium">{t('sectionScanTitle')}</h2>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              {t('sectionScanBody')}
            </p>
          </article>
          <article className="flex flex-col gap-2">
            <h2 className="text-lg font-medium">{t('sectionChatTitle')}</h2>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              {t('sectionChatBody')}
            </p>
          </article>
          <article className="flex flex-col gap-2">
            <h2 className="text-lg font-medium">{t('sectionProfileTitle')}</h2>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              {t('sectionProfileBody')}
            </p>
          </article>
        </section>
      </main>
      {!gateAccepted && <AgeGate />}
    </div>
  )
}

async function ComingSoonPage() {
  const t = await getTranslations('comingSoon')

  return (
    <div className="flex flex-col flex-1 bg-zinc-50 font-sans dark:bg-black">
      <header className="flex justify-end px-6 py-4">
        <LocaleSwitcher />
      </header>
      <main
        className="flex flex-1 w-full max-w-xl mx-auto flex-col items-start justify-center gap-6 py-16 px-8"
        data-testid="coming-soon"
      >
        <h1 className="text-4xl font-semibold leading-tight tracking-tight">
          {t('title')}
        </h1>
        <p className="text-base text-zinc-700 dark:text-zinc-300 max-w-prose">
          {t('body')}
        </p>
        <Link
          href="/"
          locale="en"
          className="text-base font-medium underline underline-offset-4"
        >
          {t('switchToEn')}
        </Link>
      </main>
    </div>
  )
}
