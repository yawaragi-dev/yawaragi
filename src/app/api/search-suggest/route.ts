import 'server-only'
import { cookies } from 'next/headers'
import { hasLocale } from 'next-intl'
import { getPathname } from '@/i18n/navigation'
import { routing, type Locale } from '@/i18n/routing'
import { hasAcceptedAgeGate } from '@/lib/legal/age-gate-cookie'
import type { CatalogueSearchResult } from '@/lib/sakenowa/search-brands'
import { suggestCatalogue } from '@/lib/sakenowa/suggest-catalogue'
import { getPrefectureNames } from '@/lib/sakenowa/prefecture'

/**
 * `GET /api/search-suggest?q=…&locale=en` — the rows for §8's list as you
 * type (#326). JSON, each row with the sake page it opens.
 *
 * `/api` skips the proxy, so this checks the 18+ gate itself: no sake data
 * before it is accepted (JMStV, ADR-0006) — 403 otherwise. Private and
 * uncached at the edge for the same reason: a shared cache would hand the
 * rows to a visitor who never passed the gate. The catalogue read behind it
 * is cached server-side (`suggest-catalogue.ts`).
 */
export const dynamic = 'force-dynamic'

export interface SuggestionRow extends CatalogueSearchResult {
  href: string
  /** The brewery's prefecture in English, for the row's meta line (v1.9 U1). */
  prefecture?: string
}

const HEADERS = { 'Cache-Control': 'private, no-store' } as const

export async function handleSuggestRequest(
  request: Request,
  deps: {
    gateAccepted: () => Promise<boolean>
    suggest: (query: string) => Promise<readonly CatalogueSearchResult[]>
  },
): Promise<Response> {
  if (!(await deps.gateAccepted())) return Response.json({ error: 'age_gate' }, { status: 403, headers: HEADERS })
  const url = new URL(request.url)
  const query = (url.searchParams.get('q') ?? '').slice(0, 80)
  const requested = url.searchParams.get('locale')
  const locale: Locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale
  const matches = await deps.suggest(query)
  const rows: SuggestionRow[] = matches.map((match) => {
    const prefecture = match.areaId ? getPrefectureNames(match.areaId)?.nameEn : undefined
    return {
      ...match,
      ...(prefecture ? { prefecture } : {}),
      href: getPathname({ locale, href: { pathname: '/sake/[brandId]', params: { brandId: String(match.brandId) } } }),
    }
  })
  return Response.json({ query, rows }, { headers: HEADERS })
}

export async function GET(request: Request): Promise<Response> {
  return handleSuggestRequest(request, {
    gateAccepted: async () => hasAcceptedAgeGate(await cookies()),
    suggest: suggestCatalogue,
  })
}

