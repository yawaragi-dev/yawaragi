import createMiddleware from 'next-intl/middleware'
import { NextResponse, type NextRequest } from 'next/server'
import { routing } from '@/i18n/routing'
import { isLaunched } from '@/i18n/launch-state'
import {
  hasAcceptedAgeGate,
  isGatedPath,
} from '@/lib/legal/age-gate-cookie'

const handleI18n = createMiddleware(routing)

export function proxy(request: NextRequest) {
  const intlResponse = handleI18n(request)

  if (intlResponse.headers.has('location')) {
    return intlResponse
  }

  const { pathname } = request.nextUrl
  if (!isGatedPath(pathname)) {
    return intlResponse
  }

  const localeMatch = pathname.match(/^\/(en|de)(?=\/|$)/)
  const locale = localeMatch?.[1] ?? routing.defaultLocale

  // For launched locales we honour the age-gate cookie; for non-launched
  // locales every gated path rewrites to the coming-soon landing regardless.
  if (isLaunched(locale) && hasAcceptedAgeGate(request.cookies)) {
    return intlResponse
  }

  const gateUrl = request.nextUrl.clone()
  gateUrl.pathname = `/${locale}`
  gateUrl.search = ''

  const rewrite = NextResponse.rewrite(gateUrl)
  for (const cookie of intlResponse.cookies.getAll()) {
    rewrite.cookies.set(cookie)
  }
  return rewrite
}

export const config = {
  matcher: ['/((?!api|_next|_vercel|.*\\..*).*)'],
}
