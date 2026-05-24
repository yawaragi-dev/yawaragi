'use client'

import { useTransition } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { usePathname, useRouter } from '@/i18n/navigation'
import { routing, type Locale } from '@/i18n/routing'

export function LocaleSwitcher() {
  const t = useTranslations('localeSwitcher')
  const locale = useLocale()
  const pathname = usePathname()
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function switchTo(next: Locale) {
    if (next === locale) return
    startTransition(() => {
      router.replace(pathname, { locale: next })
    })
  }

  return (
    <nav
      aria-label={t('label')}
      className="flex items-center gap-1 text-sm"
      data-testid="locale-switcher"
    >
      {routing.locales.map((code) => {
        const isActive = code === locale
        return (
          <button
            key={code}
            type="button"
            onClick={() => switchTo(code)}
            disabled={isActive || isPending}
            aria-current={isActive ? 'true' : undefined}
            data-locale={code}
            className={
              isActive
                ? 'px-2 py-1 font-semibold text-zinc-900 dark:text-zinc-50'
                : 'px-2 py-1 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-50 cursor-pointer'
            }
          >
            {code === 'en' ? t('english') : t('german')}
          </button>
        )
      })}
    </nav>
  )
}
