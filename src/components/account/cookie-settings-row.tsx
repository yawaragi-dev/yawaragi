'use client'

import { Cookie } from '@phosphor-icons/react/dist/ssr'
import { COOKIE_BANNER_OPEN_EVENT } from '@/components/legal/cookie-banner-events'
import { cn } from '@/lib/utils'

/**
 * §15's "Cookie settings" row: "→ reopens the cookie banner in Customise (EU)".
 *
 * A whole-row button rather than the footer's inline
 * `<CookieSettingsLink />` — §15 gives settings rows a 50px target, and
 * GDPR-wise this is the withdrawal path, which ADR-0009 requires to be "as
 * easy as giving". A 14px underlined word inside a row is not that.
 *
 * It dispatches the same event the footer link does, so the banner stays the
 * single owner of consent state and there is no second place for the stored
 * decision to drift.
 */
export function CookieSettingsRow({
  label,
  sub,
}: {
  label: string
  sub: string
}) {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event(COOKIE_BANNER_OPEN_EVENT))}
      className={cn(
        'flex w-full min-h-[50px] items-center gap-3.5 px-4 py-2.5 text-left transition-colors',
        'border-b border-divider last:border-b-0 cursor-pointer',
        'hover:bg-ash-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ginshu-600',
      )}
      data-testid="account-cookie-settings"
    >
      <Cookie size={20} className="shrink-0 text-ash-600" aria-hidden="true" />
      <span className="flex min-w-0 flex-col">
        <span className="text-body text-ink">{label}</span>
        <span className="text-meta text-ash-600">{sub}</span>
      </span>
    </button>
  )
}
