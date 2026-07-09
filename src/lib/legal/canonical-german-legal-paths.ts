import { routing } from '@/i18n/routing'

/**
 * Lowercase German URL variant → canonical capitalised path (without the
 * `/de` locale prefix), derived from the routing pathnames manifest so the
 * two never drift.
 *
 * German nouns are capitalised, so the canonical legal URLs are `/Impressum`
 * and `/Datenschutz` (see `routing.ts#pathnames`). People type URLs
 * lowercase, though, and lowercase variants aren't manifest keys — without a
 * redirect they fall through next-intl's locale-segment fallback and get
 * rewritten to the `/de` homepage (a silent 200), which reads as "this page
 * doesn't exist" and creates SEO duplicate content.
 *
 * We collect every German-localised pathname whose canonical form differs
 * from its lowercase spelling (i.e. it's capitalised) and map the lowercase
 * spelling back to the canonical one. Adding a future capitalised German
 * legal noun to the manifest wires up its redirect automatically.
 */
const CANONICAL_GERMAN_LEGAL_PATHS: ReadonlyMap<string, string> = new Map(
  Object.values(routing.pathnames)
    .flatMap((value) =>
      typeof value === 'object' && 'de' in value ? [value.de] : [],
    )
    .filter((path) => path !== path.toLowerCase())
    .map((path) => [path.toLowerCase(), path] as const),
)

const GERMAN_LOCALE_PREFIX_REGEX = /^\/de(\/.*)?$/

/**
 * Given an incoming request pathname, return the canonical capitalised German
 * legal URL it should permanently (308) redirect to, or `null` when no
 * redirect applies.
 *
 * Scoped strictly to the `de` locale — English legal paths stay lowercase.
 */
export function canonicalGermanLegalRedirect(pathname: string): string | null {
  const match = pathname.match(GERMAN_LOCALE_PREFIX_REGEX)
  if (!match) return null

  const rest = match[1] ?? ''
  const normalized =
    rest.length > 1 && rest.endsWith('/') ? rest.slice(0, -1) : rest

  const canonical = CANONICAL_GERMAN_LEGAL_PATHS.get(normalized)
  return canonical ? `/de${canonical}` : null
}
