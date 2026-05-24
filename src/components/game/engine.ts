/**
 * Pure state-stepping for the Shibuya Runner. No DOM, no Canvas, no time —
 * the caller supplies the elapsed delta per tick. Rendering and timing are
 * the component's job.
 *
 * Coordinate system: x grows rightward, y grows upward (player jumps to
 * higher y). Origin (0, 0) is the leftmost ground point. Width/height are
 * arbitrary "world units" — the renderer maps them onto the canvas.
 */

export const WORLD = {
  width: 480,
  height: 80,
  groundY: 0,
  playerX: 60,
  playerWidth: 14,
  playerHeight: 22,
  gravity: 1800, // world units / s²
  jumpVelocity: 420, // world units / s — height ≈ 49 units, clears tallest obstacle (20)
  initialSpeed: 220, // world units / s (obstacles drift left at this speed)
  speedRamp: 7, // world units / s² (gradual difficulty)
  maxSpeed: 460,
  spawnIntervalMin: 0.8, // seconds
  spawnIntervalMax: 1.9,
  milestoneInterval: 12, // seconds — Hachiko / scramble crossing / Shibuya tower drift past
} as const

export type ObstacleKind = 'beer' | 'sake' | 'strongzero'
export type MilestoneKind = 'hachiko' | 'scramble' | 'tower'

export interface Obstacle {
  kind: ObstacleKind
  x: number
  width: number
  height: number
}

export interface Milestone {
  kind: MilestoneKind
  x: number
  width: number
  height: number
}

export type GameStatus = 'idle' | 'running' | 'over'

export interface GameState {
  status: GameStatus
  distance: number // world units travelled
  best: number
  speed: number
  player: { y: number; vy: number }
  obstacles: Obstacle[]
  milestones: Milestone[]
  nextSpawnIn: number // seconds
  nextMilestoneIn: number
  /** Set when an obstacle was just dodged this tick. UI uses for sound. */
  justDodged: boolean
  /** Set when a milestone just passed this tick. UI uses for sound. */
  justMilestone: boolean
}

const OBSTACLE_DIMENSIONS: Record<ObstacleKind, { width: number; height: number }> = {
  beer: { width: 12, height: 16 },
  sake: { width: 8, height: 20 },
  strongzero: { width: 10, height: 18 },
}

const MILESTONE_DIMENSIONS: Record<MilestoneKind, { width: number; height: number }> = {
  hachiko: { width: 18, height: 22 },
  scramble: { width: 36, height: 4 },
  tower: { width: 14, height: 60 },
}

export function initialState(best = 0): GameState {
  return {
    status: 'idle',
    distance: 0,
    best,
    speed: WORLD.initialSpeed,
    player: { y: WORLD.groundY, vy: 0 },
    obstacles: [],
    milestones: [],
    nextSpawnIn: WORLD.spawnIntervalMin,
    nextMilestoneIn: WORLD.milestoneInterval,
    justDodged: false,
    justMilestone: false,
  }
}

export function start(state: GameState): GameState {
  if (state.status === 'running') return state
  return { ...initialState(state.best), status: 'running' }
}

export function jump(state: GameState): GameState {
  if (state.status !== 'running') return state
  if (state.player.y > WORLD.groundY) return state // mid-air, no double-jump
  return {
    ...state,
    player: { y: WORLD.groundY, vy: WORLD.jumpVelocity },
  }
}

/**
 * Picks the next obstacle kind deterministically from a small rotating cycle
 * augmented by `rand` (0..1). The cycle prevents long droughts of one type;
 * the random pick within a group keeps it from being totally predictable.
 */
function pickObstacleKind(rand: number, distance: number): ObstacleKind {
  const cycle: ObstacleKind[][] = [
    ['beer', 'sake'],
    ['sake', 'strongzero'],
    ['beer', 'strongzero'],
  ]
  const group = cycle[Math.floor(distance / 200) % cycle.length]
  return group[Math.floor(rand * group.length) % group.length]
}

function pickMilestoneKind(rand: number): MilestoneKind {
  const kinds: MilestoneKind[] = ['hachiko', 'scramble', 'tower']
  return kinds[Math.floor(rand * kinds.length) % kinds.length]
}

/**
 * AABB overlap. The player and each obstacle are axis-aligned rectangles.
 */
function intersects(
  ax: number,
  ay: number,
  aw: number,
  ah: number,
  bx: number,
  by: number,
  bw: number,
  bh: number,
): boolean {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by
}

export interface TickInput {
  dt: number // seconds since last tick
  rand: () => number // 0..1
}

export function tick(state: GameState, input: TickInput): GameState {
  if (state.status !== 'running') {
    return { ...state, justDodged: false, justMilestone: false }
  }

  const { dt, rand } = input

  // Speed ramp
  const speed = Math.min(state.speed + WORLD.speedRamp * dt, WORLD.maxSpeed)

  // Player physics
  let { y, vy } = state.player
  vy -= WORLD.gravity * dt
  y += vy * dt
  if (y < WORLD.groundY) {
    y = WORLD.groundY
    vy = 0
  }

  // Drift obstacles left, drop any that left the screen
  const obstaclesAfterDrift = state.obstacles.map((o) => ({
    ...o,
    x: o.x - speed * dt,
  }))
  const survivingObstacles = obstaclesAfterDrift.filter(
    (o) => o.x + o.width > -10,
  )
  const dodgedCount =
    obstaclesAfterDrift.length - survivingObstacles.length
  const justDodged = dodgedCount > 0

  // Drift milestones
  const milestonesAfterDrift = state.milestones.map((m) => ({
    ...m,
    x: m.x - speed * dt * 0.5, // milestones move slower (parallax)
  }))
  const survivingMilestones = milestonesAfterDrift.filter(
    (m) => m.x + m.width > -20,
  )

  // Spawn obstacle?
  let nextSpawnIn = state.nextSpawnIn - dt
  const nextObstacles = [...survivingObstacles]
  if (nextSpawnIn <= 0) {
    const kind = pickObstacleKind(rand(), state.distance)
    const dim = OBSTACLE_DIMENSIONS[kind]
    nextObstacles.push({
      kind,
      x: WORLD.width + 10,
      width: dim.width,
      height: dim.height,
    })
    const range = WORLD.spawnIntervalMax - WORLD.spawnIntervalMin
    nextSpawnIn =
      WORLD.spawnIntervalMin + rand() * range * (WORLD.initialSpeed / speed)
  }

  // Spawn milestone?
  let nextMilestoneIn = state.nextMilestoneIn - dt
  let justMilestone = false
  const nextMilestones = [...survivingMilestones]
  if (nextMilestoneIn <= 0) {
    const kind = pickMilestoneKind(rand())
    const dim = MILESTONE_DIMENSIONS[kind]
    nextMilestones.push({
      kind,
      x: WORLD.width + 20,
      width: dim.width,
      height: dim.height,
    })
    nextMilestoneIn = WORLD.milestoneInterval
    justMilestone = true
  }

  // Distance accrued this tick
  const distance = state.distance + speed * dt

  // Collision check
  const playerX = WORLD.playerX
  const collided = nextObstacles.some((o) =>
    intersects(
      playerX,
      y,
      WORLD.playerWidth,
      WORLD.playerHeight,
      o.x,
      0,
      o.width,
      o.height,
    ),
  )

  if (collided) {
    const best = Math.max(state.best, Math.floor(distance))
    return {
      ...state,
      status: 'over',
      best,
      distance,
      player: { y, vy },
      obstacles: nextObstacles,
      milestones: nextMilestones,
      speed,
      nextSpawnIn,
      nextMilestoneIn,
      justDodged: false,
      justMilestone: false,
    }
  }

  return {
    status: 'running',
    distance,
    best: state.best,
    speed,
    player: { y, vy },
    obstacles: nextObstacles,
    milestones: nextMilestones,
    nextSpawnIn,
    nextMilestoneIn,
    justDodged,
    justMilestone,
  }
}
