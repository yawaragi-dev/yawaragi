import type { Metadata } from 'next'
import { getTranslations, setRequestLocale } from 'next-intl/server'

/**
 * §5 TMG / DDG Impressum. Static, server-rendered, allowlisted in
 * `isGatedPath` so it is reachable without the age-gate cookie (a German
 * visitor must be able to identify the service provider before deciding to
 * accept any cookie). All copy lives in `messages/{en,de}.json` under the
 * `imprint` namespace; address fields ship as placeholders and are filled
 * from the Impressum service before public-launch per PRE-GO-LIVE §7.1.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'imprint' })
  return { title: `${t('title')} — Yawaragi` }
}

export default async function ImprintPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  setRequestLocale(locale)

  const t = await getTranslations('imprint')

  return (
    <main
      className="flex flex-1 w-full max-w-3xl mx-auto flex-col gap-8 py-16 px-8"
      data-testid="imprint-page"
    >
      <header className="flex flex-col gap-2">
        <h1 className="text-4xl font-semibold leading-tight tracking-tight">
          {t('title')}
        </h1>
        <p className="text-sm text-zinc-500">{t('lastUpdated')}</p>
        <p className="text-base text-zinc-700 dark:text-zinc-300 max-w-prose">
          {t('intro')}
        </p>
      </header>

      <section className="flex flex-col gap-2">
        <h2 className="text-xl font-medium">{t('providerHeading')}</h2>
        <p className="text-base text-zinc-700 dark:text-zinc-300">
          {t('providerName')}
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-xl font-medium">{t('providerAddressHeading')}</h2>
        <p className="text-base text-zinc-700 dark:text-zinc-300 whitespace-pre-line">
          {t('providerAddress')}
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-xl font-medium">{t('contactHeading')}</h2>
        <p className="text-base text-zinc-700 dark:text-zinc-300">
          <span className="text-zinc-500">{t('providerEmailLabel')}: </span>
          {t('providerEmail')}
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-xl font-medium">{t('responsibilityHeading')}</h2>
        <p className="text-base text-zinc-700 dark:text-zinc-300 max-w-prose">
          {t('responsibilityStatement')}
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-xl font-medium">{t('disputeResolutionHeading')}</h2>
        <p className="text-base text-zinc-700 dark:text-zinc-300 max-w-prose">
          {t('disputeResolutionBody')}
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-xl font-medium">{t('liabilityHeading')}</h2>
        <p className="text-base text-zinc-700 dark:text-zinc-300 max-w-prose">
          {t('liabilityBody')}
        </p>
      </section>
    </main>
  )
}
