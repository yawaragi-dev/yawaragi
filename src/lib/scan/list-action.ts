import 'server-only'

import { getPathname } from '@/i18n/navigation'
import { routing, type Locale } from '@/i18n/routing'
import { getListReader } from '@/lib/ai/vision/list-reader'
import { debugAdd } from '@/lib/debug/debug-log'
import { meteredCall, type Meter } from '@/lib/metering/metered-call'
import { lookupFlavorChart } from '@/lib/sakenowa/catalogue-reads'
import { resolveScannedLabel } from '@/lib/sakenowa/resolve-scanned-label'
import { ARRIVED_VIA_SCAN_QUERY } from '@/lib/scan/arrived-via-scan'
import { resolveViewerJournal } from '@/lib/taste/viewer-journal'
import type { ListActionState } from './list-action-state'
import { classifyListOutcome } from './list-outcome'
import { matchList } from './match-list'
import { rankList } from './rank-list'

/**
 * Design v1.7 §7: "Rank these for you". Reads the whole menu or shelf in the
 * photo the visitor just scanned, finds each sake in the catalogue, and ranks
 * them against the visitor's journal.
 *
 * Only for a visitor who keeps a journal (§7: signed-in only) — the ranking
 * is of their ratings, and reading a list is the costliest call the app
 * makes. It is paid from the scan's own budget (`vision-scan`): one list read
 * is one more read of the same photo.
 *
 * The photo arrives again rather than being kept from the scan: label images
 * are process-and-discard (ADR-0009), so the server never holds it between
 * the two calls. It is read inline and dropped, like the label read.
 *
 * Served by `POST /{locale}/scan/list` rather than a Server Action, so the
 * browser can abort it (#557 did the same for the label scan): leaving the
 * list screen, retaking the photo or the 30 s stop end the request.
 */
export async function readListPhoto(formData: FormData): Promise<ListActionState> {
  // The span, the debug log, the `vision-scan` rate limit and the
  // `list_read` usage counter are the meter's (`metered-call.ts`).
  return meteredCall(
    {
      bucket: 'vision-scan',
      logPrefix: '[list]',
      span: { name: 'list-action', classify: classifyListOutcome },
      count: (result) => (result.status === 'read' ? 'list_read' : null),
    },
    (meter) => run(formData, meter),
  )
}

async function run(formData: FormData, meter: Meter): Promise<ListActionState> {
  const image = formData.get('image')
  const kind = formData.get('kind')
  const locale = formData.get('locale')
  if (
    !(image instanceof Blob) ||
    image.size === 0 ||
    (kind !== 'menu' && kind !== 'shelf') ||
    typeof locale !== 'string' ||
    !(routing.locales as readonly string[]).includes(locale)
  ) {
    return { status: 'invalid_input' }
  }

  const viewer = await resolveViewerJournal(meter.cookieJar)
  if (!viewer.canLog) return { status: 'not_allowed' }

  return meter.pay(async (): Promise<ListActionState> => {
    try {
      const read = await getListReader().readList(image, kind)
      const matched = await matchList(read, {
        resolve: (label) => resolveScannedLabel(label),
        chartFor: (brandId) => lookupFlavorChart(brandId),
        sakeHref: (brandId) =>
          getPathname({
            locale: locale as Locale,
            href: { pathname: '/sake/[brandId]', params: { brandId: String(brandId) }, query: ARRIVED_VIA_SCAN_QUERY },
          }),
      })
      const { rows, ranked, tastings } = rankList(matched.rows, viewer.entries, Date.now())
      debugAdd('ListAction', `read ${read.lines.length} line(s): ${rows.length} sake(s), ${matched.unmatched.length} unmatched, ${matched.notSake.length} not sake`, {
        ranked,
        unreadable: read.unreadable_count,
      })
      return {
        status: 'read',
        result: {
          kind: read.kind,
          ...(read.currency ? { currency: read.currency } : {}),
          rows,
          unmatched: matched.unmatched,
          notSake: matched.notSake,
          unreadableCount: read.unreadable_count,
          ranked,
          tastings,
        },
      }
    } catch (err) {
      debugAdd('ListAction', `reading the list threw: ${err instanceof Error ? err.name : 'UnknownError'}`, {
        message: err instanceof Error ? err.message.slice(0, 500) : String(err),
      }, 'error')
      return { status: 'failed' }
    }
  })
}
