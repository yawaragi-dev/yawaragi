import type { Locale } from './routing'

/**
 * Locales whose product surface is publicly launched. Non-launched locales
 * render a coming-soon page at `/{locale}/` and the proxy rewrites every
 * gated path under `/{locale}/*` to that page (regardless of age-gate cookie
 * state) so no product content can leak.
 *
 * Per ADR-0008: flip a locale live by adding it here, after the matching
 * legal copy (Impressum, Privacy) is in `messages/{locale}.json`.
 */
export const LAUNCHED_LOCALES: ReadonlySet<Locale> = new Set(['en'])

export function isLaunched(locale: string): boolean {
  return (LAUNCHED_LOCALES as ReadonlySet<string>).has(locale)
}
