import { NextResponse } from 'next/server'
import { hasLocale } from 'next-intl'
import { routing } from '@/i18n/routing'
import { SAMPLE_COLLECTION_COOKIE } from '@/lib/demo/sample-flag'
import { countUsage } from '@/lib/stats/count-usage'

/**
 * `/api/sample-collection` — look through the sample collection, or stop.
 *
 * A plain GET a link can point at (the README, the landing, a tab's
 * placeholder), so the sample is one tap away and shareable. It only sets a
 * flag the visitor asked for and sends them on; nothing is stored about them.
 * A session cookie, so the sample ends with the browser session.
 *
 * Route handlers may write cookies; RSC renders may not (CLAUDE.md), which is
 * why the switch lives here and the pages only read it.
 */
export const dynamic = 'force-dynamic'

export function GET(request: Request): NextResponse {
  const url = new URL(request.url)
  const requested = url.searchParams.get('locale')
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale
  const leave = url.searchParams.get('leave') === '1'

  const res = NextResponse.redirect(new URL(`/${locale}/${leave ? 'home' : 'collection'}`, url), 303)
  if (leave) {
    res.cookies.set(SAMPLE_COLLECTION_COOKIE, '', { path: '/', maxAge: 0 })
  } else {
    countUsage('sample_opened')
    res.cookies.set(SAMPLE_COLLECTION_COOKIE, '1', {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: url.protocol === 'https:',
    })
  }
  res.headers.set('Cache-Control', 'no-store')
  return res
}
