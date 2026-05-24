import { describe, expect, it } from 'vitest'
import { initialState, jump, start, tick, WORLD } from './engine'

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
    const midAir = { ...first, player: { y: 20, vy: first.player.vy / 2 } }
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
      player: { y: 40, vy: 0 },
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
})
