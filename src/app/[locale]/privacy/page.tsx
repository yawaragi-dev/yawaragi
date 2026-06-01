import type { Metadata } from 'next'
import { getTranslations, setRequestLocale } from 'next-intl/server'

/**
 * GDPR privacy policy. Static, server-rendered, allowlisted in `isGatedPath`
 * so it is reachable without the age-gate cookie (the cookie banner must be
 * able to deep-link here before the visitor consents to anything). Copy
 * lives in `messages/{en,de}.json` under the `privacy` namespace and is
 * updated in the same PR that introduces a new processing operation per
 * ADR-0009.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'privacy' })
  return { title: `${t('title')} — Yawaragi` }
}

export default async function PrivacyPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  setRequestLocale(locale)

  const t = await getTranslations('privacy')

  return (
    <main
      className="flex flex-1 w-full max-w-3xl mx-auto flex-col gap-8 py-16 px-8"
      data-testid="privacy-page"
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

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-medium">{t('processorsHeading')}</h2>
        <p className="text-base text-zinc-700 dark:text-zinc-300 max-w-prose">
          {t('processorVercel')}
        </p>
        <p className="text-base text-zinc-700 dark:text-zinc-300 max-w-prose">
          {t('processorSupabase')}
        </p>
        <p className="text-base text-zinc-700 dark:text-zinc-300 max-w-prose">
          {t('sakenowaNote')}
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-xl font-medium">{t('retentionHeading')}</h2>
        <p className="text-base text-zinc-700 dark:text-zinc-300 max-w-prose">
          {t('retention')}
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-xl font-medium">{t('contactHeading')}</h2>
        <p className="text-base text-zinc-700 dark:text-zinc-300 max-w-prose">
          {t('contact')}
        </p>
      </section>
    </main>
  )
}
