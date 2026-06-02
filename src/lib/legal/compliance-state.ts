/**
 * Read seam composing the two operationally-independent compliance cookies
 * into a single value object per request.
 *
 * IMPORTANT: This module is a *read seam*, not a legal merger. The two
 * underlying regimes stay deliberately distinct:
 *   - `ageGate` — JMStV §6(5) self-declared 18+ acceptance.
 *     Cookie: `yawaragi_age_gate`. See `docs/adr/0006-age-gate-jmstv.md`.
 *   - `consent` — GDPR Art. 6(1)(a) granular consent decision.
 *     Cookie: `yawaragi_consent`. See `docs/adr/0009-gdpr-compliance-posture.md`.
 *
 * They are NEVER blended into a single "compliance accepted" boolean — each
 * field has its own lawful basis, its own UX surface, its own retention rule.
 *
 * The seam exists so that downstream callers (the proxy, the locale layout,
 * and Phase 4's chat / label-scan surfaces) can ask "what compliance state
 * does this request have?" in one call instead of two, without losing the
 * regime distinction.
 *
 * Module shape: small interface, deep enough to delegate to the two adapter
 * modules (`age-gate-cookie.ts`, `consent.ts`) — neither adapter's interface
 * changes; only the read is composed.
 */

import {
  CONSENT_COOKIE_NAME,
  parseConsent,
  type ConsentDecision,
} from './consent'
import { hasAcceptedAgeGate, type CookieJar } from './age-gate-cookie'

export interface ComplianceState {
  /**
   * JMStV §6(5) age-gate acceptance, derived from the `yawaragi_age_gate`
   * cookie. `true` only when the cookie is present, parsable, version-current,
   * and not expired. See `hasAcceptedAgeGate` for the full rules.
   */
  ageGate: boolean
  /**
   * GDPR consent decision parsed from the `yawaragi_consent` cookie, or
   * `null` when the visitor has not yet decided (no cookie, malformed value,
   * or stored version no longer matches `CURRENT_CONSENT_VERSION`).
   */
  consent: ConsentDecision | null
}

/**
 * Compose the age-gate and consent reads into one ComplianceState snapshot.
 *
 * The `now` parameter is forwarded to the age-gate freshness check so tests
 * can pin the clock; the consent parser is time-independent.
 *
 * Works on both the edge runtime (Next.js `request.cookies` from `proxy.ts`)
 * and React Server Components (the awaited `cookies()` from `next/headers`)
 * because both satisfy the structural `CookieJar` interface.
 */
export function getComplianceState(
  cookieJar: CookieJar,
  now: number = Date.now(),
): ComplianceState {
  return {
    ageGate: hasAcceptedAgeGate(cookieJar, now),
    consent: parseConsent(cookieJar.get(CONSENT_COOKIE_NAME)?.value),
  }
}
