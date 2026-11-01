'use client'

/**
 * PROTOTYPE chrome — the floating bar that flips between a prototype's
 * layouts (`?variant=`) and, optionally, its fixtures (`?cellar=`). Not part
 * of any design under review, so it looks deliberately unlike the app: a
 * light pill on the dark ground. ← and → cycle too, except while typing.
 *
 * Throwaway with the prototype that mounts it. The page decides whether it
 * shows (never on production).
 */
import { useEffect } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { CaretLeft, CaretRight } from '@phosphor-icons/react/dist/ssr'

export interface PrototypeSwitcherProps {
  variants: readonly { key: string; label: string }[]
  current: string
  previousLabel: string
  nextLabel: string
  badge: string
  /** A second toggle, e.g. the fixture: one param, each option a label. */
  fixture?: { param: string; options: readonly { value: string; label: string }[]; current: string }
}

export function PrototypeSwitcher({ variants, current, previousLabel, nextLabel, badge, fixture }: PrototypeSwitcherProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const index = Math.max(0, variants.findIndex((v) => v.key === current))

  const go = (param: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set(param, value)
    router.replace(`${pathname}?${params.toString()}`, { scroll: false })
  }
  const step = (by: number) => go('variant', variants[(index + by + variants.length) % variants.length].key)

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
      const el = document.activeElement
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || (el instanceof HTMLElement && el.isContentEditable)) return
      step(event.key === 'ArrowLeft' ? -1 : 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const v = variants[index]
  return (
    <div
      className="fixed bottom-24 left-1/2 z-50 flex -translate-x-1/2 items-center gap-1 rounded-full bg-ash-900 px-1.5 py-1 text-ground shadow-lg"
      data-testid="prototype-switcher"
    >
      <span className="px-2 text-micro font-medium uppercase tracking-wider opacity-70">{badge}</span>
      <button type="button" onClick={() => step(-1)} aria-label={previousLabel} className="flex size-8 items-center justify-center rounded-full hover:bg-ash-800">
        <CaretLeft size={16} aria-hidden="true" />
      </button>
      <span className="min-w-0 px-1 text-meta font-medium whitespace-nowrap" aria-live="polite">
        {v.key} — {v.label}
      </span>
      <button type="button" onClick={() => step(1)} aria-label={nextLabel} className="flex size-8 items-center justify-center rounded-full hover:bg-ash-800">
        <CaretRight size={16} aria-hidden="true" />
      </button>
      {fixture && (
        <button
          type="button"
          onClick={() => {
            const i = fixture.options.findIndex((o) => o.value === fixture.current)
            go(fixture.param, fixture.options[(i + 1) % fixture.options.length].value)
          }}
          className="ml-1 rounded-full border border-ash-500 px-2.5 py-1 text-meta whitespace-nowrap"
        >
          {fixture.options.find((o) => o.value === fixture.current)?.label}
        </button>
      )}
    </div>
  )
}
