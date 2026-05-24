import { getTranslations } from 'next-intl/server'
import { Link } from '@/i18n/navigation'
import { ShibuyaRunner } from '@/components/game/shibuya-runner'

export default async function NotFound() {
  const t = await getTranslations('notFound')

  return (
    <main
      className="flex flex-1 w-full max-w-3xl mx-auto flex-col gap-6 py-16 px-8"
      data-testid="not-found"
    >
      <h1 className="text-4xl font-semibold leading-tight tracking-tight">
        {t('title')}
      </h1>
      <p className="text-base text-zinc-700 dark:text-zinc-300 max-w-prose">
        {t('body')}
      </p>
      <Link
        href="/"
        className="text-base font-medium underline underline-offset-4"
      >
        {t('home')}
      </Link>
      <hr className="border-zinc-200 dark:border-zinc-800 my-2" />
      <p className="text-sm text-zinc-600 dark:text-zinc-400 max-w-prose">
        {t('game.intro')}
      </p>
      <ShibuyaRunner />
    </main>
  )
}
