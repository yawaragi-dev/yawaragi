'use client'

import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import {
  initialState,
  jump,
  start,
  tick,
  WORLD,
  type GameState,
  type MilestoneKind,
  type ObstacleKind,
} from './engine'
import {
  BEER,
  HACHIKO,
  SAKE,
  SALARYMAN_JUMPING,
  SALARYMAN_RUN_A,
  SALARYMAN_RUN_B,
  SCRAMBLE,
  STRONG_ZERO,
  TOWER,
  type Sprite,
} from './sprites'
import { SoundEngine } from './sounds'

const PIXEL = 3 // each world unit renders as this many canvas pixels (CSS scales)
const CANVAS_W = WORLD.width * PIXEL
const CANVAS_H = WORLD.height * PIXEL
const GROUND_PX = 18 // canvas pixels of empty space below the ground line
const STORAGE_KEY = 'yawaragi_shibuya_runner_best'

const OBSTACLE_SPRITE: Record<ObstacleKind, Sprite> = {
  beer: BEER,
  sake: SAKE,
  strongzero: STRONG_ZERO,
}

const MILESTONE_SPRITE: Record<MilestoneKind, Sprite> = {
  hachiko: HACHIKO,
  scramble: SCRAMBLE,
  tower: TOWER,
}

function drawSprite(
  ctx: CanvasRenderingContext2D,
  sprite: Sprite,
  x: number,
  y: number,
  color: string,
) {
  ctx.fillStyle = color
  for (let row = 0; row < sprite.length; row++) {
    const line = sprite[row]
    for (let col = 0; col < line.length; col++) {
      if (line[col] === '#') {
        ctx.fillRect(
          Math.round(x + col * PIXEL),
          Math.round(y + row * PIXEL),
          PIXEL,
          PIXEL,
        )
      }
    }
  }
}

function render(canvas: HTMLCanvasElement, state: GameState, frame: number) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.clearRect(0, 0, canvas.width, canvas.height)

  // Ground line
  const groundCanvasY = canvas.height - GROUND_PX
  ctx.fillStyle = '#a1a1aa' // zinc-400
  ctx.fillRect(0, groundCanvasY, canvas.width, 1)

  // Milestones (back layer)
  for (const m of state.milestones) {
    const sprite = MILESTONE_SPRITE[m.kind]
    const heightPx = sprite.length * PIXEL
    drawSprite(
      ctx,
      sprite,
      m.x * PIXEL,
      groundCanvasY - heightPx,
      '#d4d4d8', // zinc-300 — softer, recedes into background
    )
  }

  // Obstacles
  for (const o of state.obstacles) {
    drawSprite(
      ctx,
      OBSTACLE_SPRITE[o.kind],
      o.x * PIXEL,
      groundCanvasY - o.height * PIXEL,
      '#171717', // foreground
    )
  }

  // Player
  const playerSprite =
    state.player.y > 0
      ? SALARYMAN_JUMPING
      : frame % 16 < 8
        ? SALARYMAN_RUN_A
        : SALARYMAN_RUN_B
  const playerYpx =
    groundCanvasY - state.player.y * PIXEL - WORLD.playerHeight * PIXEL
  drawSprite(ctx, playerSprite, WORLD.playerX * PIXEL, playerYpx, '#171717')
}

function loadBest(): number {
  if (typeof window === 'undefined') return 0
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    return raw ? parseInt(raw, 10) || 0 : 0
  } catch {
    return 0
  }
}

function saveBest(value: number) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, String(value))
  } catch {
    /* localStorage disabled — no-op */
  }
}

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

interface UiState {
  status: 'idle' | 'running' | 'over'
  distance: number
  best: number
}

export function ShibuyaRunner() {
  const t = useTranslations('notFound.game')
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const stateRef = useRef<GameState>(initialState())
  const frameRef = useRef(0)
  const soundsRef = useRef<SoundEngine>(new SoundEngine())
  const [ui, setUi] = useState<UiState>({ status: 'idle', distance: 0, best: 0 })
  const [reducedMotion, setReducedMotion] = useState(false)
  const [showAnyway, setShowAnyway] = useState(false)
  const [soundOn, setSoundOn] = useState(false)

  useEffect(() => {
    // Hydrate from browser-only APIs on mount. Lint flags setState-in-effect
    // as a cascading-render smell — appropriate as a default, but this is the
    // documented React pattern for SSR-safe browser API reads (matchMedia,
    // localStorage). One cascading render on mount is fine.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReducedMotion(prefersReducedMotion())
    const fresh = initialState(loadBest())
    stateRef.current = fresh
    setUi({ status: fresh.status, distance: fresh.distance, best: fresh.best })
  }, [])

  // Sound toggle effect
  useEffect(() => {
    soundsRef.current.setEnabled(soundOn)
  }, [soundOn])

  // Main game loop
  useEffect(() => {
    if (reducedMotion && !showAnyway) return

    let raf = 0
    let lastTs = 0
    const loop = (ts: number) => {
      if (!lastTs) lastTs = ts
      const dt = Math.min((ts - lastTs) / 1000, 0.05) // clamp big tab-switch jumps
      lastTs = ts
      frameRef.current += 1

      const previous = stateRef.current
      const next = tick(previous, { dt, rand: Math.random })
      stateRef.current = next

      if (next.justDodged) soundsRef.current.play('dodge')
      if (next.justMilestone) soundsRef.current.play('milestone')
      if (previous.status === 'running' && next.status === 'over') {
        soundsRef.current.play('gameover')
        if (next.best > previous.best) saveBest(next.best)
      }

      const canvas = canvasRef.current
      if (canvas) render(canvas, next, frameRef.current)

      // Only update React state if a visible field actually changed —
      // keeps the renders down to status/best transitions and one per ~10
      // distance units instead of 60/s.
      setUi((prev) => {
        const newDistance = Math.floor(next.distance)
        if (
          prev.status === next.status &&
          prev.best === next.best &&
          Math.abs(prev.distance - newDistance) < 1
        ) {
          return prev
        }
        return { status: next.status, distance: newDistance, best: next.best }
      })
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [reducedMotion, showAnyway])

  // Input handling: spacebar / arrow-up / tap
  useEffect(() => {
    if (reducedMotion && !showAnyway) return

    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.code === 'ArrowUp') {
        e.preventDefault()
        applyInput()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [reducedMotion, showAnyway])

  function applyInput() {
    const state = stateRef.current
    if (state.status === 'idle' || state.status === 'over') {
      const next = start(state)
      stateRef.current = next
      setUi({ status: next.status, distance: 0, best: next.best })
      soundsRef.current.play('start')
    } else {
      const next = jump(state)
      stateRef.current = next
      if (state.player.y === 0) soundsRef.current.play('jump')
    }
  }

  if (reducedMotion && !showAnyway) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-zinc-500">{t('reducedMotionNote')}</p>
        <button
          type="button"
          onClick={() => setShowAnyway(true)}
          className="self-start text-sm underline underline-offset-4 cursor-pointer"
        >
          {t('showAnyway')}
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3" data-testid="shibuya-runner">
      <div className="flex items-center justify-between text-sm tabular-nums">
        <div className="flex gap-4">
          <span>
            {t('score')}: <span className="font-medium">{ui.distance}</span>
          </span>
          <span className="text-zinc-500">
            {t('best')}: <span className="font-medium">{ui.best}</span>
          </span>
        </div>
        <button
          type="button"
          onClick={() => setSoundOn((v) => !v)}
          aria-pressed={soundOn}
          className="text-xs text-zinc-500 underline underline-offset-4 cursor-pointer"
          data-testid="game-sound-toggle"
        >
          {soundOn ? t('soundOn') : t('soundOff')}
        </button>
      </div>
      <button
        type="button"
        onClick={applyInput}
        aria-label={t('canvasLabel')}
        className="block rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 overflow-hidden cursor-pointer"
        data-testid="game-canvas-wrap"
      >
        <canvas
          ref={canvasRef}
          width={CANVAS_W}
          height={CANVAS_H}
          className="block w-full h-auto image-rendering-pixelated"
          style={{ imageRendering: 'pixelated' }}
        />
      </button>
      <p className="text-xs text-zinc-500">
        {ui.status === 'idle' && t('hintIdle')}
        {ui.status === 'running' && t('hintRunning')}
        {ui.status === 'over' && t('hintOver')}
      </p>
    </div>
  )
}
