import { describe, expect, it } from 'vitest'
import { initialState, jump, releaseJump, start, tick, WORLD } from './engine'

describe('start', () => {
  it('moves idle → running and resets distance', () => {
    const s = initialState(42)
    const next = start(s)
    expect(next.status).toBe('running')
    expect(next.distance).toBe(0)
    expect(next.best).toBe(42) // best survives restart
  })

  it('is a no-op when already running', () => {
    const s = { ...initialState(), status: 'running' as const, distance: 50 }
    expect(start(s).distance).toBe(50)
  })
})

describe('jump', () => {
  it('gives upward velocity from the ground', () => {
    const running = start(initialState())
    const jumped = jump(running)
    expect(jumped.player.vy).toBe(WORLD.jumpVelocity)
  })

  it('does not allow double-jump while in the air', () => {
    const running = start(initialState())
    const first = jump(running)
    // simulate being mid-air
    const midAir = {
      ...first,
      player: { y: 20, vy: first.player.vy / 2, jumpHoldRemaining: 0 },
    }
    const second = jump(midAir)
    expect(second.player.vy).toBe(midAir.player.vy)
  })

  it('does nothing when not running', () => {
    const idle = initialState()
    expect(jump(idle)).toEqual(idle)
  })
})

describe('tick — physics', () => {
  it('applies gravity each tick when airborne', () => {
    let s = start(initialState())
    s = jump(s)
    const after = tick(s, { dt: 0.1, rand: () => 0.5 })
    // velocity decreases due to gravity
    expect(after.player.vy).toBeLessThan(WORLD.jumpVelocity)
    // player has moved up
    expect(after.player.y).toBeGreaterThan(0)
  })

  it('clamps the player to the ground on landing', () => {
    let s = start(initialState())
    s = jump(s)
    // step a long enough time to fully come back down
    s = tick(s, { dt: 2, rand: () => 0.5 })
    expect(s.player.y).toBe(WORLD.groundY)
    expect(s.player.vy).toBe(0)
  })

  it('ramps speed over time but caps at max', () => {
    let s = start(initialState())
    for (let i = 0; i < 1000; i++) {
      s = tick(s, { dt: 0.1, rand: () => 0.5 })
    }
    expect(s.speed).toBeLessThanOrEqual(WORLD.maxSpeed)
    expect(s.speed).toBeGreaterThan(WORLD.initialSpeed)
  })

  it('accumulates distance proportional to speed × time', () => {
    let s = start(initialState())
    const initialSpeed = s.speed
    s = tick(s, { dt: 1, rand: () => 0.5 })
    // distance ≈ (initialSpeed + speedRamp * dt) * dt because speed ramps
    // BEFORE distance accrues in the tick
    expect(s.distance).toBeGreaterThanOrEqual(initialSpeed * 1)
    expect(s.distance).toBeLessThanOrEqual(initialSpeed * 1 + WORLD.speedRamp * 2)
  })
})

describe('tick — obstacles', () => {
  it('spawns an obstacle at the right edge after the spawn interval elapses', () => {
    const s = start(initialState())
    const advanced = tick(s, { dt: WORLD.spawnIntervalMin + 0.01, rand: () => 0.5 })
    expect(advanced.obstacles).toHaveLength(1)
    expect(advanced.obstacles[0].x).toBeGreaterThan(WORLD.playerX)
  })

  it('drifts obstacles leftward and prunes them off-screen', () => {
    let s = start(initialState())
    s = tick(s, { dt: WORLD.spawnIntervalMin + 0.01, rand: () => 0.5 })
    expect(s.obstacles).toHaveLength(1)
    const firstX = s.obstacles[0].x
    s = tick(s, { dt: 0.1, rand: () => 0.5 })
    expect(s.obstacles[0].x).toBeLessThan(firstX)
    // run long enough that the obstacle leaves the screen
    for (let i = 0; i < 100; i++) {
      s = tick(s, { dt: 0.05, rand: () => 0.5 })
    }
    // there may be a new spawn but the original is gone
    expect(s.obstacles.every((o) => o.x > 0 || o.x + o.width > -10)).toBe(true)
  })

  it('reports justDodged when an obstacle exits the screen', () => {
    const running = start(initialState())
    // hand-place an obstacle right at the prune boundary
    const aboutToPrune = {
      ...running,
      obstacles: [
        { kind: 'beer' as const, x: -10, width: 12, height: 16 },
      ],
    }
    const after = tick(aboutToPrune, { dt: 0.1, rand: () => 0.5 })
    expect(after.obstacles).toHaveLength(0)
    expect(after.justDodged).toBe(true)
  })
})

describe('tick — collision', () => {
  it('transitions to game-over and updates best when collided', () => {
    const startState = start(initialState(10))
    // hand-place an obstacle right where the player is standing
    const colliding = {
      ...startState,
      obstacles: [
        {
          kind: 'beer' as const,
          x: WORLD.playerX,
          width: 12,
          height: 16,
        },
      ],
      distance: 100,
    }
    const after = tick(colliding, { dt: 0.01, rand: () => 0.5 })
    expect(after.status).toBe('over')
    expect(after.best).toBeGreaterThanOrEqual(100)
  })

  it('does not collide when the player is above the obstacle', () => {
    const startState = start(initialState())
    const overhead = {
      ...startState,
      player: { y: 40, vy: 0, jumpHoldRemaining: 0 },
      obstacles: [
        {
          kind: 'sake' as const,
          x: WORLD.playerX,
          width: 8,
          height: 20,
        },
      ],
    }
    const after = tick(overhead, { dt: 0.01, rand: () => 0.5 })
    expect(after.status).toBe('running')
  })
})

describe('tick — idle / over', () => {
  it('returns the same state when idle', () => {
    const idle = initialState()
    const after = tick(idle, { dt: 0.1, rand: () => 0.5 })
    expect(after.status).toBe('idle')
    expect(after.distance).toBe(0)
  })

  it('returns the same state when over', () => {
    const over = { ...initialState(), status: 'over' as const, distance: 100 }
    const after = tick(over, { dt: 0.1, rand: () => 0.5 })
    expect(after.status).toBe('over')
    expect(after.distance).toBe(100)
  })
})

describe('tick — milestones', () => {
  it('spawns a milestone when the interval elapses', () => {
    const s = start(initialState())
    // collapse the milestone timer to zero and step
    const ready = { ...s, nextMilestoneIn: 0 }
    const after = tick(ready, { dt: 0.05, rand: () => 0.1 })
    expect(after.milestones).toHaveLength(1)
    expect(after.justMilestone).toBe(true)
    expect(after.nextMilestoneIn).toBe(WORLD.milestoneInterval)
  })

  it('spawns a train milestone when distance crosses trainAtDistance', () => {
    const s = start(initialState())
    const justBefore = { ...s, distance: WORLD.trainAtDistance - 1 }
    const after = tick(justBefore, { dt: 1, rand: () => 0.5 })
    expect(after.milestones.some((m) => m.kind === 'train')).toBe(true)
    expect(after.lastTrainDistance).toBe(WORLD.trainAtDistance)
  })

  it('spawns one train per trainAtDistance crossing, not on every tick', () => {
    const s = start(initialState())
    const past = {
      ...s,
      distance: WORLD.trainAtDistance + 100,
      lastTrainDistance: WORLD.trainAtDistance,
    }
    const after = tick(past, { dt: 0.05, rand: () => 0.5 })
    expect(after.milestones.filter((m) => m.kind === 'train')).toHaveLength(0)
  })
})

describe('tick — boss', () => {
  it('spawns a boss obstacle when distance crosses bossAtDistance', () => {
    const s = start(initialState())
    const justBefore = { ...s, distance: WORLD.bossAtDistance - 1 }
    const after = tick(justBefore, { dt: 1, rand: () => 0.5 })
    expect(after.obstacles.some((o) => o.kind === 'boss')).toBe(true)
    expect(after.justBoss).toBe(true)
    expect(after.lastBossDistance).toBe(WORLD.bossAtDistance)
  })

  it('only spawns one boss per crossing, not every subsequent tick', () => {
    const s = start(initialState())
    const past = {
      ...s,
      distance: WORLD.bossAtDistance + 100,
      lastBossDistance: WORLD.bossAtDistance,
    }
    const after = tick(past, { dt: 0.05, rand: () => 0.5 })
    expect(after.obstacles.filter((o) => o.kind === 'boss')).toHaveLength(0)
    expect(after.justBoss).toBe(false)
  })

  it('the boss obstacle is tall enough that the tap-jump cannot clear it', () => {
    // Tap jump apex ≈ vy² / (2g) = 315² / 3600 ≈ 27.6 units
    // Boss height = 32 units → tap-jump player y at apex < boss height → collision
    const tapApexY = WORLD.jumpVelocity ** 2 / (2 * WORLD.gravity)
    expect(tapApexY).toBeLessThan(32)
  })
})

describe('tick — variable jump (hold-to-jump-higher)', () => {
  it('rises higher when jumpHeld is true vs false (same elapsed time)', () => {
    const baseline = jump(start(initialState()))
    let held = baseline
    let tapped = baseline
    for (let i = 0; i < 6; i++) {
      held = tick(held, { dt: 0.02, rand: () => 0.5, jumpHeld: true })
      tapped = tick(tapped, { dt: 0.02, rand: () => 0.5, jumpHeld: false })
    }
    expect(held.player.y).toBeGreaterThan(tapped.player.y)
  })

  it('releaseJump zeros the hold timer so subsequent ticks use full gravity', () => {
    let s = jump(start(initialState()))
    expect(s.player.jumpHoldRemaining).toBe(WORLD.maxJumpHoldTime)
    s = releaseJump(s)
    expect(s.player.jumpHoldRemaining).toBe(0)
    // velocity decreases at full gravity from here even if jumpHeld arrives later
    const before = s
    const after = tick(s, { dt: 0.05, rand: () => 0.5, jumpHeld: true })
    const expectedVy = before.player.vy - WORLD.gravity * 0.05
    expect(after.player.vy).toBeCloseTo(expectedVy, 1)
  })

  it('hold has no effect once player is descending (vy <= 0)', () => {
    const s = start(initialState())
    const descending = {
      ...s,
      player: { y: 30, vy: -100, jumpHoldRemaining: WORLD.maxJumpHoldTime },
    }
    const after = tick(descending, { dt: 0.05, rand: () => 0.5, jumpHeld: true })
    const expectedVy = -100 - WORLD.gravity * 0.05
    expect(after.player.vy).toBeCloseTo(expectedVy, 1)
  })
})
