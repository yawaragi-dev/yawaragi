'use client'

import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import {
  initialState,
  jump,
  releaseJump,
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
  SKYLINE_BUILDINGS,
  STRONG_ZERO,
  TOWER,
  TRAIN,
  type Sprite,
} from './sprites'
import { SoundEngine } from './sounds'

const PIXEL = 3 // each world unit renders as this many canvas pixels (CSS scales)
const CANVAS_W = WORLD.width * PIXEL
const CANVAS_H = WORLD.height * PIXEL
const GROUND_PX = 24 // canvas pixels of asphalt below the ground line
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
  train: TRAIN,
}

const SKY_TOP = '#1e1b4b' // indigo-950 — Tokyo night sky
const SKY_BOTTOM = '#f97316' // orange-500 — sunset glow
const ASPHALT = '#18181b' // zinc-900
const RAIL = '#71717a' // zinc-500
const GROUND_LINE = '#d4d4d8' // zinc-300

function drawSprite(
  ctx: CanvasRenderingContext2D,
  sprite: Sprite,
  x: number,
  y: number,
) {
  for (let row = 0; row < sprite.pixels.length; row++) {
    const line = sprite.pixels[row]
    for (let col = 0; col < line.length; col++) {
      const ch = line[col]
      if (ch === '.') continue
      const color = sprite.palette[ch]
      if (!color) continue
      ctx.fillStyle = color
      ctx.fillRect(
        Math.round(x + col * PIXEL),
        Math.round(y + row * PIXEL),
        PIXEL,
        PIXEL,
      )
    }
  }
}

function drawSky(ctx: CanvasRenderingContext2D, width: number, height: number) {
  const grad = ctx.createLinearGradient(0, 0, 0, height)
  grad.addColorStop(0, SKY_TOP)
  grad.addColorStop(0.7, '#7c2d12') // orange-900 transition
  grad.addColorStop(1, SKY_BOTTOM)
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, width, height)
}

function drawSkyline(
  ctx: CanvasRenderingContext2D,
  groundCanvasY: number,
  offset: number,
) {
  // Tile the skyline horizontally so it covers the full width, with a slow
  // parallax offset.
  const sprite = SKYLINE_BUILDINGS
  const tileW = sprite.pixels[0].length * PIXEL
  const heightPx = sprite.pixels.length * PIXEL
  const yTop = groundCanvasY - heightPx
  const startX = -(offset % tileW)
  for (let x = startX; x < CANVAS_W + tileW; x += tileW) {
    drawSprite(ctx, sprite, x, yTop)
  }
}

function drawGround(
  ctx: CanvasRenderingContext2D,
  groundCanvasY: number,
  offset: number,
  width: number,
) {
  // Asphalt band below the ground line
  ctx.fillStyle = ASPHALT
  ctx.fillRect(0, groundCanvasY, width, GROUND_PX)

  // Crisp ground line
  ctx.fillStyle = GROUND_LINE
  ctx.fillRect(0, groundCanvasY, width, 1)

  // Train rails — two parallel lines with sleepers
  const rail1Y = groundCanvasY + 8
  const rail2Y = groundCanvasY + 16
  ctx.fillStyle = RAIL
  ctx.fillRect(0, rail1Y, width, 1)
  ctx.fillRect(0, rail2Y, width, 1)

  // Sleepers (ties) scroll past at game speed
  const sleeperGap = 18
  const sleeperW = 8
  const sleeperStart = -(offset % sleeperGap)
  for (let x = sleeperStart; x < width + sleeperGap; x += sleeperGap) {
    ctx.fillRect(x, rail1Y + 2, sleeperW, 2)
  }
}

function render(canvas: HTMLCanvasElement, state: GameState, frame: number) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  drawSky(ctx, canvas.width, canvas.height)

  const groundCanvasY = canvas.height - GROUND_PX

  // Parallax: skyline drifts at 1/4 of game distance, sleepers at 1×.
  drawSkyline(ctx, groundCanvasY, state.distance * 0.25)

  // Milestones (mid layer; drift at the engine-computed half speed)
  for (const m of state.milestones) {
    const sprite = MILESTONE_SPRITE[m.kind]
    const heightPx = sprite.pixels.length * PIXEL
    drawSprite(ctx, sprite, m.x * PIXEL, groundCanvasY - heightPx)
  }

  drawGround(ctx, groundCanvasY, state.distance, canvas.width)

  // Obstacles (foreground)
  for (const o of state.obstacles) {
    drawSprite(
      ctx,
      OBSTACLE_SPRITE[o.kind],
      o.x * PIXEL,
      groundCanvasY - o.height * PIXEL,
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
  drawSprite(ctx, playerSprite, WORLD.playerX * PIXEL, playerYpx)
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
  const jumpHeldRef = useRef(false)
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
      const next = tick(previous, {
        dt,
        rand: Math.random,
        jumpHeld: jumpHeldRef.current,
      })
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

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.code === 'ArrowUp') {
        e.preventDefault()
        if (e.repeat) return
        jumpHeldRef.current = true
        applyJumpStart()
      }
    }
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.code === 'ArrowUp') {
        jumpHeldRef.current = false
        stateRef.current = releaseJump(stateRef.current)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [reducedMotion, showAnyway])

  function applyJumpStart() {
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

  function endHoldFromTap() {
    jumpHeldRef.current = false
    stateRef.current = releaseJump(stateRef.current)
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
        onPointerDown={(e) => {
          e.preventDefault()
          jumpHeldRef.current = true
          applyJumpStart()
        }}
        onPointerUp={endHoldFromTap}
        onPointerCancel={endHoldFromTap}
        onPointerLeave={endHoldFromTap}
        aria-label={t('canvasLabel')}
        className="block rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 overflow-hidden cursor-pointer touch-none"
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
