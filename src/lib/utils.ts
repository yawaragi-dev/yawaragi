import { clsx, type ClassValue } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'

/**
 * The Ginshu type scale, by the names `globals.css` gives them under
 * `@theme` (`--text-hero`, `--text-body`, …).
 *
 * tailwind-merge has to be told about these. `text-*` is ambiguous — it is
 * both the font-size utility and the text-colour utility — so tailwind-merge
 * resolves unknown values by heuristic, and a bare word like `hero` reads as a
 * colour name rather than a size. The consequence is silent and cost an hour
 * on the age gate: `cn('text-base …', 'text-hero')` kept BOTH, `text-base` won
 * on source order, and the 34px hero rendered at 16px with no warning, no type
 * error and no failing test.
 *
 * Every shadcn primitive sets a default size through `cn()`, so any ported
 * surface that passes one of these down hits the same trap. Listing them here
 * fixes it once rather than at each callsite with an `!important`.
 *
 * Keep in sync with the `--text-*` tokens in `globals.css`.
 */
const GINSHU_TEXT_SIZES = [
  'onboarding',
  'hero',
  'axis-title',
  'tab-title',
  'bottle-name',
  'headline',
  'title',
  'lg-alt',
  'md-alt',
  'card-heading',
  'body',
  'secondary',
  'meta',
  'section-label',
  'micro',
] as const

const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [{ text: [...GINSHU_TEXT_SIZES] }],
    },
  },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
