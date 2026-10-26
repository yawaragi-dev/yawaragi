'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Pause, Play } from '@phosphor-icons/react/dist/ssr'

/**
 * The one client piece of the landing's hero loop: a way to stop it.
 *
 * The loop moves for longer than five seconds next to the page's text, so
 * WCAG 2.2.2 (Pause, Stop, Hide) asks for a control that pauses it. Pausing
 * holds the frame on screen (`animation-play-state`, via `data-paused` in
 * `globals.css`) rather than jumping anywhere. The loop also pauses itself
 * while it is scrolled out of view (#450: "pauses off-screen"), which the
 * visitor's own choice survives.
 *
 * Under reduced motion the loop is a still frame and there is nothing to
 * pause, so the button is not shown.
 */
export function LandingLoopPlayer({
  phone,
  captions,
  label,
  pauseLabel,
  playLabel,
}: {
  phone: ReactNode
  captions: ReactNode
  label: string
  pauseLabel: string
  playLabel: string
}) {
  const [paused, setPaused] = useState(false)
  const [offscreen, setOffscreen] = useState(false)
  const ref = useRef<HTMLElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(([entry]) => setOffscreen(!entry.isIntersecting))
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return (
    <figure
      ref={ref}
      className="yw-loop mx-auto flex w-[300px] flex-col items-center gap-4 max-[339px]:[zoom:0.9]"
      aria-label={label}
      data-paused={paused || offscreen ? '' : undefined}
      data-testid="landing-hero"
    >
      {phone}
      <figcaption className="flex w-full items-center gap-2">
        <div className="min-w-0 flex-1 pl-2">{captions}</div>
        <button
          type="button"
          onClick={() => setPaused((p) => !p)}
          aria-pressed={paused}
          aria-label={pauseLabel}
          className="grid size-11 shrink-0 place-items-center rounded-full text-ash-600 transition-colors hover:bg-ash-200 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ginshu-600 motion-reduce:hidden"
          data-testid="landing-loop-pause"
          title={paused ? playLabel : pauseLabel}
        >
          {paused ? <Play size={18} aria-hidden="true" /> : <Pause size={18} aria-hidden="true" />}
        </button>
      </figcaption>
    </figure>
  )
}
