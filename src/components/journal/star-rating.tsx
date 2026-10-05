'use client'

import { StarGlyph } from '@/components/journal/star-row'
import { MAX_RATING, RATING_STEP } from '@/lib/taste/taste-action-state'

/**
 * §5's star row as an input: five 34px stars, each split into a left half
 * and a right half, so ten targets give the half-step scale. Tapping one IS
 * the save (rule 1) — this component only reports the value; the panel saves.
 *
 * Ten real buttons rather than a slider: a tap target per value is what the
 * design draws, it needs no drag, and each button can say exactly what it does
 * ("Rate 4.5 stars"). `aria-pressed` marks the current value, so a screen
 * reader hears which one is set.
 *
 * Client because it handles clicks. Labels come in as a function so the
 * caller's translator stays the one place the words live.
 */
export function StarRating({
  value,
  onRate,
  rateLabel,
  popKey,
  disabled = false,
}: {
  value: number
  onRate: (rating: number) => void
  rateLabel: (rating: number) => string
  popKey?: number
  disabled?: boolean
}) {
  const steps = MAX_RATING / RATING_STEP
  return (
    <div className="flex gap-1" role="group" data-testid="star-rating">
      {Array.from({ length: steps / 2 }, (_, i) => i + 1).map((star) => (
        <span key={`${star}-${popKey ?? 0}`} className="relative inline-block size-[34px]">
          <StarGlyph index={star} value={value} size={33} pop={popKey != null} />
          {[star - 0.5, star].map((v, half) => (
            <button
              key={v}
              type="button"
              disabled={disabled}
              onClick={() => onRate(v)}
              aria-label={rateLabel(v)}
              aria-pressed={value === v}
              className={`absolute top-0 h-full w-1/2 cursor-pointer rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ginshu-600 disabled:cursor-default ${half === 0 ? 'left-0' : 'right-0'}`}
              data-testid={`star-rating-${v}`}
            />
          ))}
        </span>
      ))}
    </div>
  )
}
