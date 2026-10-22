import { getTranslations } from 'next-intl/server'
import { getPrefectureNames } from '@/lib/sakenowa/prefecture'
import { cn } from '@/lib/utils'

/**
 * Design v1.9 X2: a tile grid of Japan's 47 prefectures, each a square of the
 * same size placed roughly where it lies — no licensed outline, legible at
 * 390 px, and small prefectures count as much as Hokkaidō. `[areaId, column,
 * row]` on a 13-column grid, taken from the prototype (`PREF_TILES`); the ids
 * are the JIS codes Sakenowa uses.
 */
const TILES: ReadonlyArray<readonly [number, number, number]> = [
  [1, 12, 0], [2, 12, 1], [5, 11, 2], [3, 12, 2], [6, 11, 3], [4, 12, 3],
  [17, 8, 4], [16, 9, 4], [15, 10, 4], [7, 11, 4],
  [18, 7, 5], [21, 8, 5], [20, 9, 5], [10, 10, 5], [9, 11, 5], [8, 12, 5],
  [26, 6, 6], [25, 7, 6], [23, 8, 6], [19, 9, 6], [11, 10, 6], [13, 11, 6], [12, 12, 6],
  [32, 3, 7], [31, 4, 7], [28, 5, 7], [27, 6, 7], [29, 7, 7], [24, 8, 7], [22, 9, 7], [14, 10, 7],
  [35, 2, 8], [34, 3, 8], [33, 4, 8], [30, 6, 8],
  [41, 0, 9], [40, 1, 9], [44, 2, 9], [38, 3, 9], [37, 4, 9],
  [42, 0, 10], [43, 1, 10], [45, 2, 10], [39, 3, 10], [36, 4, 10],
  [46, 1, 11], [47, 0, 12],
]

/** Shading (X2): 1 · 2–3 · 4 or more, and none yet. */
function shade(count: number): string {
  return count >= 4 ? 'bg-ginshu-600' : count >= 2 ? 'bg-ginshu-400' : count === 1 ? 'bg-ginshu-300' : 'bg-ash-200'
}

export async function PrefectureTileMap({ counts }: { counts: ReadonlyMap<number, number> }) {
  const t = await getTranslations('palate.numbers')
  return (
    <div className="flex flex-col gap-2.5">
      <div
        role="img"
        aria-label={t('mapLabel')}
        className="grid w-full max-w-[290px] grid-cols-13 gap-[3px] self-center"
        data-testid="prefecture-tile-map"
      >
        {TILES.map(([id, column, row]) => {
          const count = counts.get(id) ?? 0
          return (
            <span
              key={id}
              title={t('tileLabel', { name: getPrefectureNames(id)?.nameEn ?? String(id), count })}
              className={cn('aspect-square rounded-[3px]', shade(count))}
              style={{ gridColumn: column + 1, gridRow: row + 1 }}
              data-count={count}
            />
          )
        })}
      </div>
      <div className="flex flex-wrap items-center gap-3 text-micro text-ash-700" aria-hidden="true">
        {[
          ['bg-ginshu-300', t('legendOne')],
          ['bg-ginshu-400', t('legendSome')],
          ['bg-ginshu-600', t('legendMany')],
          ['bg-ash-200 shadow-[inset_0_0_0_1px_#4a4744]', t('legendNone')],
        ].map(([swatch, label]) => (
          <span key={label} className="flex items-center gap-1.5 whitespace-nowrap">
            <span className={cn('size-2.5 rounded-[2px]', swatch)} />
            {label}
          </span>
        ))}
      </div>
    </div>
  )
}
