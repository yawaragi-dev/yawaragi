'use client'

import { useTransition } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { useParams } from 'next/navigation'
import { usePathname, useRouter } from '@/i18n/navigation'
import { routing, type Locale } from '@/i18n/routing'

export function LocaleSwitcher() {
  const t = useTranslations('localeSwitcher')
  const locale = useLocale()
  const pathname = usePathname()
  const params = useParams()
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function switchTo(next: Locale) {
    if (next === locale) return
    startTransition(() => {
      // Pass {pathname, params} together so next-intl can rebuild a
      // dynamic route (e.g. /sake/[brandId]) under the target locale.
      // For static routes `params` is empty and the call collapses to
      // the same shape as the pre-pathnames version.
      router.replace(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        { pathname, params: params as any },
        { locale: next },
      )
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
