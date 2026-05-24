import { cookies } from 'next/headers'
import { getTranslations } from 'next-intl/server'
import { Link } from '@/i18n/navigation'
import { isLaunched } from '@/i18n/launch-state'
import { AgeGate } from '@/components/legal/age-gate'
import { hasAcceptedAgeGate } from '@/lib/legal/age-gate-cookie'

export default async function LandingPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params

  if (!isLaunched(locale)) {
    return <ComingSoonPage />
  }

  const t = await getTranslations('landing')
  const cookieJar = await cookies()
  const gateAccepted = hasAcceptedAgeGate(cookieJar)

  return (
    <>
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
    </>
  )
}

async function ComingSoonPage() {
  const t = await getTranslations('comingSoon')

  return (
    <main
      className="flex flex-1 w-full max-w-3xl mx-auto flex-col items-start justify-center gap-6 py-16 px-8"
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
  )
}
