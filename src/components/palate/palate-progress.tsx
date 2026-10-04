import { cn } from '@/lib/utils'
import { PALATE_READ_THRESHOLD } from '@/lib/taste/palate-read'

/**
 * §12's three-segment progress bar, shown under three tastings.
 *
 * Three segments, not a percentage: the threshold IS three, and a bar that
 * read "67%" would invite the question "67% of what". One filled segment per
 * tasting answers "how many more" without a sentence — which is what the
 * sentence beside it then says in words anyway, for anyone who cannot see it.
 */
export function PalateProgress({ ratingCount, label }: { ratingCount: number; label: string }) {
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={PALATE_READ_THRESHOLD}
      aria-valuenow={Math.min(ratingCount, PALATE_READ_THRESHOLD)}
      aria-label={label}
      className="flex gap-1.5"
      data-testid="palate-progress"
    >
      {Array.from({ length: PALATE_READ_THRESHOLD }, (_, index) => (
        <span
          key={index}
          className={cn(
            'h-1 flex-1 rounded-full',
            index < ratingCount ? 'bg-ginshu-500' : 'bg-ash-200',
          )}
        />
      ))}
    </div>
  )
}
