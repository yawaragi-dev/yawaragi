export const CONSENT_COOKIE_NAME = 'yawaragi_consent'
export const CONSENT_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365

/**
 * Bump when the cookie payload shape changes or new consent categories are
 * introduced. A version mismatch is treated as "no decision" so the banner
 * re-prompts.
 */
export const CURRENT_CONSENT_VERSION = 1

export interface ConsentDecision {
  necessary: true
  analytics: boolean
  marketing: boolean
  version: number
}

export type ConsentChoice = Omit<ConsentDecision, 'necessary' | 'version'>

/**
 * Returns the recorded decision, or `null` when the visitor has not yet
 * decided (no cookie, malformed value, or stored version no longer matches).
 */
export function parseConsent(cookieValue: string | undefined): ConsentDecision | null {
  if (!cookieValue) return null

  let parsed: unknown
  try {
    parsed = JSON.parse(cookieValue)
  } catch {
    return null
  }

  if (!isPlausibleDecision(parsed)) return null
  if (parsed.version !== CURRENT_CONSENT_VERSION) return null

  return {
    necessary: true,
    analytics: Boolean(parsed.analytics),
    marketing: Boolean(parsed.marketing),
    version: CURRENT_CONSENT_VERSION,
  }
}

function isPlausibleDecision(
  value: unknown,
): value is { version: number; analytics: unknown; marketing: unknown } {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  return (
    'version' in record &&
    'analytics' in record &&
    'marketing' in record &&
    typeof record.version === 'number'
  )
}

export function serializeConsent(choice: ConsentChoice): string {
  return JSON.stringify({
    necessary: true,
    analytics: choice.analytics,
    marketing: choice.marketing,
    version: CURRENT_CONSENT_VERSION,
  })
}

export interface ConsentCookieAttrs {
  name: typeof CONSENT_COOKIE_NAME
  value: string
  maxAge: number
  path: '/'
  sameSite: 'lax'
  secure: boolean
  httpOnly: false
}

export function consentCookieAttrs(
  choice: ConsentChoice,
  isProd: boolean = process.env.NODE_ENV === 'production',
): ConsentCookieAttrs {
  return {
    name: CONSENT_COOKIE_NAME,
    value: serializeConsent(choice),
    maxAge: CONSENT_COOKIE_MAX_AGE_SECONDS,
    path: '/',
    sameSite: 'lax',
    secure: isProd,
    httpOnly: false,
  }
}
