'use client'

import { useTranslations } from 'next-intl'
import { ArrowsClockwise, CloudWarning, House } from '@phosphor-icons/react/dist/ssr'
import { Link } from '@/i18n/navigation'

/**
 * What an app screen shows when it could not be drawn (#324) — most often
 * because the catalogue mirror is out of reach for a moment. A sake's page is
 * nothing without its row, so there is no partial page to fall back to; this
 * says so plainly, offers to try again, and gives a way out that is not the
 * tab bar the shell keeps drawing around it.
 *
 * Wraps every page of the `(app)` group but not its layout, so the tab bar
 * and the cookie banner stay. The error itself is not shown: a server error
 * reaches the browser as a generic message with a digest, which means nothing
 * to a visitor (the digest is in the server log).
 */
export default function AppError({ unstable_retry }: { error: Error & { digest?: string }; unstable_retry: () => void }) {
  const t = useTranslations('appError')
  return (
    <main className="flex flex-1 flex-col gap-5 overflow-y-auto px-5 py-8" data-testid="app-error" data-no-catalogue-data="">
      <span className="text-ash-600" aria-hidden="true">
        <CloudWarning size={28} />
      </span>
      <div className="flex flex-col gap-2">
        <h1 className="text-title font-medium text-ink">{t('title')}</h1>
        <p className="text-subtle leading-normal text-ash-700">{t('body')}</p>
      </div>
      <button
        type="button"
        onClick={() => unstable_retry()}
        className="flex min-h-11 items-center justify-center gap-2 rounded-xl border-[1.5px] border-ginshu-400 px-4 text-body font-medium text-ginshu-700 transition-colors hover:bg-ginshu-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ginshu-600"
        data-testid="app-error-retry"
      >
        <ArrowsClockwise size={16} aria-hidden="true" />
        {t('retry')}
      </button>
      <Link
        href="/home"
        className="flex min-h-11 w-fit items-center gap-2 text-subtle font-medium text-ginshu-700 hover:text-ginshu-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ginshu-600"
        data-testid="app-error-home"
      >
        <House size={16} aria-hidden="true" />
        {t('home')}
      </Link>
    </main>
  )
}
