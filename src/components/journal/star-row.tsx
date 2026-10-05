import { Star, StarHalf } from '@phosphor-icons/react/dist/ssr'
import { cn } from '@/lib/utils'

/**
 * Five stars showing a rating on the 0.5–5 half-step scale (design v1.4 §5):
 * filled ginshu-600, empty ash-400, a half star where the rating has one.
 * Display only — {@link StarRating} is the input. Decorative to assistive
 * tech: the caller puts the rating in words beside it or in an `aria-label`.
 *
 * Server-safe (no hooks), so the bottle page and the journal render it as
 * plain markup.
 */
export function StarRow({
  value,
  size = 13,
  className,
  popKey,
}: {
  value: number
  size?: number
  className?: string
  /** Changes on every new rating; the filled stars pop in, staggered (§5). */
  popKey?: number
}) {
  return (
    <span className={cn('inline-flex gap-px', className)} aria-hidden="true">
      {[1, 2, 3, 4, 5].map((i) => (
        <StarGlyph key={`${i}-${popKey ?? 0}`} index={i} value={value} size={size} pop={popKey != null} />
      ))}
    </span>
  )
}

export function StarGlyph({
  index,
  value,
  size,
  pop = false,
}: {
  index: number
  value: number
  size: number
  pop?: boolean
}) {
  const full = value >= index
  const half = !full && value >= index - 0.5
  const lit = full || half
  const Icon = half ? StarHalf : Star
  return (
    <Icon
      size={size}
      weight={lit ? 'fill' : 'regular'}
      className={cn(
        lit ? 'text-ginshu-600' : 'text-ash-400',
        pop && lit && 'motion-safe:animate-yw-pop',
      )}
      // §5: "yw-pop .3s with a 35ms stagger".
      style={pop && lit ? { animationDelay: `${index * 35}ms`, animationFillMode: 'both' } : undefined}
      aria-hidden="true"
    />
  )
}
