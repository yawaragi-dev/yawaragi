import { describe, expect, it } from 'vitest'
import { cn } from './utils'

describe('cn', () => {
  it('lets a Ginshu type-scale size override a primitive default', () => {
    // The bug this exists to prevent: shadcn primitives set their own size
    // through `cn()`, so every ported surface passes a Ginshu size into a
    // class list that already has one. Keeping both is silent — no error, no
    // failing test, just text at the wrong size — and source order decides.
    expect(cn('text-base leading-none font-medium', 'text-hero')).toBe(
      'font-medium text-hero',
    )
    expect(cn('text-sm', 'text-micro')).toBe('text-micro')
    expect(cn('text-title', 'text-body')).toBe('text-body')
  })

  it("drops a leading the size is entitled to set", () => {
    // `leading-none` disappearing above is correct, not collateral: in
    // Tailwind v4 a `text-*` utility also sets line-height, so a later size
    // legitimately overrides an earlier leading. It matters here because the
    // dialog primitive ships `leading-none`, which at 34px would crush the
    // two-line hero — the merge does the right thing by dropping it.
    expect(cn('leading-none', 'text-hero')).toBe('text-hero')
    // An explicit leading AFTER the size still wins, which is the escape
    // hatch when a surface really does want tight lines.
    expect(cn('text-hero', 'leading-none')).toBe('text-hero leading-none')
  })

  it('still treats a colour as a colour, not a size', () => {
    // The scale names must not swallow the colour group: a size and a colour
    // are both `text-*` and both have to survive together.
    expect(cn('text-body text-ash-600')).toBe('text-body text-ash-600')
    expect(cn('text-ash-600', 'text-ginshu-700')).toBe('text-ginshu-700')
  })

  it('keeps Tailwind\'s own scale working', () => {
    expect(cn('text-base', 'text-lg')).toBe('text-lg')
  })
})
