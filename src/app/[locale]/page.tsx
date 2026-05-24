import { cookies } from 'next/headers'
import { setRequestLocale } from 'next-intl/server'
import { getTranslations } from 'next-intl/server'
import { LocaleSwitcher } from '@/components/layout/locale-switcher'
import { AgeGate } from '@/components/legal/age-gate'
import { hasAcceptedAgeGate } from '@/lib/legal/age-gate-cookie'

export default async function LandingPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  setRequestLocale(locale)
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
