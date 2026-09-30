import { cn } from '@/lib/utils'
import { Link } from '@/i18n/navigation'
import type { FlavorAxis } from '@/lib/schemas/flavor-chart'
import type { FlavorDifference } from '@/lib/flavor/similarity-reason'

/**
 * One row of §6's ranked list: name, brewery, a "{n}% similar" tag, and a
 * one-line reason built from the axis differences.
 *
 * The reason is composed here rather than in `similarity-reason.ts` because it
 * is a sentence, and German wants its own phrasing ("Genauso kräftig, dafür
 * weniger blumig") rather than a translated English skeleton. The lib decides
 * *which* axes; this decides how to say it.
 */

/** §6: "accent tag at ≥95, else neutral". */
const ACCENT_TAG_THRESHOLD = 95

export interface SimilarSakeRowStrings {
  readonly percentSimilar: (percent: number) => string
  readonly axisPair: (first: string, second: string) => string
  readonly reason: {
    readonly sharedAndMore: (shared: string, axis: string) => string
    readonly sharedAndLess: (shared: string, axis: string) => string
    readonly sharedOnly: (shared: string) => string
    readonly moreOnly: (axis: string) => string
    readonly lessOnly: (axis: string) => string
  }
  /** The prose form of each axis — lowercase adjectives, per locale. */
  readonly axisWord: (axis: FlavorAxis) => string
}

export function SimilarSakeRow({
  brandId,
  nameKanji,
  nameRomaji,
  breweryKanji,
  breweryRomaji,
  percent,
  difference,
  strings,
}: {
  brandId: number
  nameKanji: string
  nameRomaji: string | null
  breweryKanji: string | null
  breweryRomaji: string | null
  percent: number
  difference: FlavorDifference
  strings: SimilarSakeRowStrings
}) {
  const reason = composeReason(difference, strings)
  const isClose = percent >= ACCENT_TAG_THRESHOLD

  return (
    <li>
      {/*
        A divider-bottom row, not a rounded card: that is the prototype's list
        vocabulary here (`border-bottom: 1px solid divider`, 13px vertical
        padding, no radius, no fill). The hover fill stays, because unlike the
        prototype's static rows these are real links and UX-F wants a tap to
        say something.

        **No thumb.** §6 lists one first and the prototype draws a 36×50
        striped placeholder, in the same vocabulary as §5's photo slot. §5
        fills its slot with the visitor's own capture; a catalogue row has no
        equivalent, and Sakenowa's Data API ships no images, so the placeholder
        here could never become a picture. Five permanently-empty rectangles is
        noise, so the rows are text-only and the question is with the designers
        as #308 §7.
      */}
      <Link
        href={{ pathname: '/sake/[brandId]', params: { brandId: String(brandId) } }}
        className="flex flex-col gap-0.5 border-b border-divider px-1 py-3.5 transition-colors hover:bg-ash-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ginshu-600"
        data-testid="similar-sake-row"
      >
        <span className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="text-card-heading font-medium text-ink" lang="ja">
            {nameKanji}
          </span>
          {nameRomaji && <span className="text-subtle text-ash-600">{nameRomaji}</span>}
          <span
            className={cn(
              'ml-auto shrink-0 rounded-full px-2 py-0.5 text-meta font-medium',
              // §6 reserves the accent for a genuinely close match, so the
              // tag means something when it is coloured.
              isClose ? 'bg-ginshu-900 text-ginshu-200' : 'bg-ash-200 text-ash-700',
            )}
            data-testid="similar-sake-percent"
          >
            {strings.percentSimilar(percent)}
          </span>
        </span>

        {breweryKanji && (
          <span className="flex flex-wrap items-baseline gap-x-2 text-meta text-ash-600">
            <span lang="ja">{breweryKanji}</span>
            {breweryRomaji && <span>({breweryRomaji})</span>}
          </span>
        )}

        {reason && (
          // 13px ash-700, per the prototype — a step up from the brewery line
          // above it, because the reason is the row's content and the brewery
          // is its metadata.
          <span className="mt-0.5 text-subtle leading-snug text-ash-700" data-testid="similar-sake-reason">
            {reason}
          </span>
        )}
      </Link>
    </li>
  )
}

/**
 * Turn the picked axes into the locale's sentence.
 *
 * Returns `null` only if the difference names nothing at all, which cannot
 * happen for two real charts — every axis is either inside the shared band or
 * outside it — but a `null` row beats an empty sentence if it ever does.
 */
function composeReason(
  { sharedAxes, divergentAxis }: FlavorDifference,
  strings: SimilarSakeRowStrings,
): string | null {
  const shared =
    sharedAxes.length === 2
      ? strings.axisPair(strings.axisWord(sharedAxes[0]), strings.axisWord(sharedAxes[1]))
      : sharedAxes.length === 1
        ? strings.axisWord(sharedAxes[0])
        : null

  if (shared && divergentAxis) {
    const axis = strings.axisWord(divergentAxis.axis)
    return divergentAxis.direction === 'more'
      ? strings.reason.sharedAndMore(shared, axis)
      : strings.reason.sharedAndLess(shared, axis)
  }
  if (shared) return strings.reason.sharedOnly(shared)
  if (divergentAxis) {
    const axis = strings.axisWord(divergentAxis.axis)
    return divergentAxis.direction === 'more'
      ? strings.reason.moreOnly(axis)
      : strings.reason.lessOnly(axis)
  }
  return null
}
