import { getTranslations } from 'next-intl/server'
import { Link } from '@/i18n/navigation'

export default async function Under18Page() {
  const t = await getTranslations('under18')

  return (
    <main className="flex flex-1 w-full max-w-2xl mx-auto flex-col gap-6 py-16 px-8">
      <h1 className="text-3xl font-semibold leading-tight tracking-tight">
        {t('title')}
      </h1>
      <p className="text-base text-zinc-700 dark:text-zinc-300">{t('body')}</p>
      <p className="text-sm text-zinc-500">
        <Link href="/imprint" className="underline">
          {t('imprintLink')}
        </Link>
      </p>
    </main>
  )
}
