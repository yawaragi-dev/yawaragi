export const AGE_GATE_COOKIE_NAME = 'yawaragi_age_gate'
export const AGE_GATE_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365
const COOKIE_VERSION = 1

type CookiePayload = { v: number; ts: number }

export interface CookieJar {
  get(name: string): { value: string } | undefined
}

export function hasAcceptedAgeGate(
  cookieJar: CookieJar,
  now: number = Date.now(),
): boolean {
  const cookie = cookieJar.get(AGE_GATE_COOKIE_NAME)
  if (!cookie?.value) return false

  let parsed: unknown
  try {
    parsed = JSON.parse(cookie.value)
  } catch {
    return false
  }

  if (!isCookiePayload(parsed)) return false
  if (parsed.v !== COOKIE_VERSION) return false

  const ageMs = now - parsed.ts
  if (ageMs < 0) return false
  if (ageMs > AGE_GATE_COOKIE_MAX_AGE_SECONDS * 1000) return false

  return true
}

function isCookiePayload(value: unknown): value is CookiePayload {
  return (
    typeof value === 'object' &&
    value !== null &&
    'v' in value &&
    'ts' in value &&
    typeof (value as Record<string, unknown>).v === 'number' &&
    typeof (value as Record<string, unknown>).ts === 'number'
  )
}

export interface AgeGateCookieAttrs {
  name: typeof AGE_GATE_COOKIE_NAME
  value: string
  maxAge: number
  path: '/'
  sameSite: 'lax'
  secure: boolean
  httpOnly: false
}

export function ageGateCookieAttrs(
  now: number = Date.now(),
  isProd: boolean = process.env.NODE_ENV === 'production',
): AgeGateCookieAttrs {
  return {
    name: AGE_GATE_COOKIE_NAME,
    value: JSON.stringify({ v: COOKIE_VERSION, ts: now }),
    maxAge: AGE_GATE_COOKIE_MAX_AGE_SECONDS,
    path: '/',
    sameSite: 'lax',
    secure: isProd,
    httpOnly: false,
  }
}

const LOCALE_PREFIX_REGEX = /^\/(en|de)(?=\/|$)/
// The legal-page paths appear here both in their canonical (en) form AND
// their German-localised form because the proxy sees the EXTERNAL request
// URL before next-intl rewrites it back to the canonical segment. Adding a
// new locale that uses different external paths means adding entries here
// AND extending routing.ts#pathnames in the same change-set; the two lists
// are intentionally kept side-by-side rather than derived.
const UNGATED_LOCALE_PATHS: ReadonlySet<string> = new Set([
  '',
  '/',
  '/imprint',
  '/Impressum',
  '/privacy',
  '/Datenschutz',
  '/under-18',
  // PRD #105 §"Age-gate interaction" / issue #106: the scan entry CTA is a
  // discovery affordance and is allowed pre-age-gate. The scan RESULT is
  // not — the matched-state UI redirects to `/[locale]/sake/[brandId]`,
  // which IS gated, so an unaccepted visitor still hits the gate landing
  // before any flavor / brand data renders. Adding `/scan` here applies
  // only to the entry CTA, not to results.
  '/scan',
])

export function isGatedPath(pathname: string): boolean {
  if (pathname === '/') return false
  if (pathname.startsWith('/_next/')) return false
  // `/_vercel/*` is the Vercel Analytics endpoint. We don't currently use
  // Vercel Analytics — enabling it requires an ADR-0009 review (new vendor,
  // DPA, privacy-policy update). Allowlisting in advance so a future
  // integration doesn't accidentally get gated.
  if (pathname.startsWith('/_vercel/')) return false
  if (pathname.startsWith('/api/')) return false
  if (pathname === '/favicon.ico') return false
  if (pathname === '/robots.txt') return false
  if (pathname === '/sitemap.xml') return false
  if (/\.[a-z0-9]+$/i.test(pathname)) return false

  const localeMatch = pathname.match(LOCALE_PREFIX_REGEX)
  if (!localeMatch) return true

  const withoutLocale = pathname.slice(localeMatch[0].length)
  const normalized =
    withoutLocale.length > 1 && withoutLocale.endsWith('/')
      ? withoutLocale.slice(0, -1)
      : withoutLocale

  return !UNGATED_LOCALE_PATHS.has(normalized)
}
