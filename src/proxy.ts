import createMiddleware from 'next-intl/middleware'
import { NextResponse, type NextRequest } from 'next/server'
import { clerkMiddleware } from '@clerk/nextjs/server'
import { routing } from '@/i18n/routing'
import { isLaunched } from '@/i18n/launch-state'
import {
  DEBUG_URL_PARAM,
  clearDebugCookie,
  readDebugUrlParam,
  setDebugCookie,
} from '@/lib/debug/debug-mode'
import { isGatedPath } from '@/lib/legal/age-gate-cookie'
import { getComplianceState } from '@/lib/legal/compliance-state'

const handleI18n = createMiddleware(routing)

/**
 * Handle `?debug=...` activation / deactivation at the edge:
 *   - On `enable` (1 / true): set the debug cookie + redirect to the
 *     same URL with the param stripped, so the address bar stays clean.
 *   - On `disable` (0 / false): clear the cookie + redirect.
 *   - On no debug param: pass through (returns null).
 *
 * The redirect carries the cookie set / clear directly so the next
 * navigation sees the updated state — no race between cookie write
 * and downstream reads.
 */
function handleDebugActivation(request: NextRequest): NextResponse | null {
  const directive = readDebugUrlParam(request.nextUrl.searchParams)
  if (directive === null) return null

  const cleaned = request.nextUrl.clone()
  cleaned.searchParams.delete(DEBUG_URL_PARAM)

  const response = NextResponse.redirect(cleaned)
  if (directive === 'enable') {
    setDebugCookie(response)
  } else {
    clearDebugCookie(response)
  }
  return response
}

// Execution order (per issue #55):
//   1. clerkMiddleware identifies the user and populates auth() context.
//      No route is force-protected at this layer — Phase 2 has no auth UI;
//      route protection lands with Phase 2.5+ surfaces.
//   2. next-intl resolves the locale, emits NEXT_LOCALE, and may redirect.
//   3. Age-gate + non-launched-locale rewrite logic runs unchanged.
// Clerk wraps the whole pipeline so server components downstream (the RSC
// tree) can call auth() / currentUser() — that populates the JWT used by
// getUserScopedClient() in Phase 2.5+ (ADR-0010).
function runIntlAndAgeGate(request: NextRequest) {
  // Debug activation runs first — it short-circuits with a redirect
  // so the cookie write lands on a clean URL before intl / age-gate
  // get a chance to rewrite. The intl + age-gate logic re-runs on the
  // redirected request just like any other navigation.
  const debugResponse = handleDebugActivation(request)
  if (debugResponse !== null) return debugResponse

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
  // The compliance-state read seam composes age-gate + consent reads; only
  // the JMStV `ageGate` field gates routing here. GDPR `consent` is read by
  // the layout for the cookie banner — distinct regimes (see ADR-0006 vs
  // ADR-0009), shared read.
  const { ageGate } = getComplianceState(request.cookies)
  if (isLaunched(locale) && ageGate) {
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

export const proxy = clerkMiddleware((_auth, request) => runIntlAndAgeGate(request))

export const config = {
  // Skip:
  //  - api / _next / _vercel internals
  //  - Next.js metadata file conventions served at the root without an
  //    extension (icon, apple-icon, opengraph-image, twitter-image, manifest,
  //    sitemap, robots) — otherwise next-intl rewrites them through the
  //    locale router and the metadata file never serves
  //  - any path containing a dot (static asset extensions, favicon.ico, etc.)
  matcher: [
    '/((?!api|_next|_vercel|icon|apple-icon|opengraph-image|twitter-image|manifest|sitemap|robots|.*\\..*).*)',
  ],
}
