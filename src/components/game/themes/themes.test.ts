import { describe, expect, it } from 'vitest'
import type { MilestoneKind, ObstacleKind } from '../engine'
import type { Sprite } from '../sprites'
import { SHIBUYA_THEME } from './shibuya'
import { SICILY_THEME } from './sicily'
import type { Theme } from './types'

/**
 * Each theme fills the same engine slots. The engine assigns physical
 * dimensions to each obstacle/milestone kind; the sprite has to share
 * those dimensions or rendering breaks (sprite floats over the collision
 * box, or collision box clips an empty area). These dimensions come from
 * `engine.ts` and are pinned here so a new theme can't drift.
 */
const OBSTACLE_DIM: Record<ObstacleKind, { width: number; height: number }> = {
  beer: { width: 12, height: 16 },
  sake: { width: 8, height: 20 },
  strongzero: { width: 10, height: 18 },
  boss: { width: 18, height: 32 },
}

const MILESTONE_DIM: Record<MilestoneKind, { width: number; height: number }> = {
  hachiko: { width: 18, height: 22 },
  scramble: { width: 36, height: 4 },
  tower: { width: 14, height: 60 },
  train: { width: 80, height: 22 },
}

const PLAYER_DIM = { width: 16, height: 24 }

function spriteWidth(sprite: Sprite): number {
  // Sprites are allowed to be ragged (rows of different widths) — the
  // engine cares about the maximum, since drift / collision use that.
  return Math.max(...sprite.pixels.map((r) => r.length))
}

function spriteHeight(sprite: Sprite): number {
  return sprite.pixels.length
}

function assertThemeShape(theme: Theme) {
  // The strict invariant is height — the engine positions sprites by
  // subtracting `height * PIXEL` from the ground line, so a sprite taller
  // or shorter than the engine's recorded height for that kind floats or
  // sinks. Width is checked with a small tolerance (existing salaryman
  // frames have a 17-char arm-out row over a 16-unit collision box) since
  // visual overhang is harmless: collision math uses the engine's width
  // constant, not the sprite's max row length.
  const widthTolerance = 2
  for (const kind of Object.keys(OBSTACLE_DIM) as ObstacleKind[]) {
    const sprite = theme.obstacles[kind]
    const expected = OBSTACLE_DIM[kind]
    expect(spriteHeight(sprite), `${theme.id}.${kind} height`).toBe(expected.height)
    expect(spriteWidth(sprite), `${theme.id}.${kind} width`).toBeLessThanOrEqual(
      expected.width + widthTolerance,
    )
  }
  for (const kind of Object.keys(MILESTONE_DIM) as MilestoneKind[]) {
    const sprite = theme.milestones[kind]
    const expected = MILESTONE_DIM[kind]
    expect(spriteHeight(sprite), `${theme.id}.${kind} height`).toBe(expected.height)
    expect(spriteWidth(sprite), `${theme.id}.${kind} width`).toBeLessThanOrEqual(
      expected.width + widthTolerance,
    )
  }
  for (const frame of ['jumping', 'runA', 'runB'] as const) {
    const sprite = theme.player[frame]
    expect(spriteHeight(sprite), `${theme.id}.player.${frame} height`).toBe(
      PLAYER_DIM.height,
    )
    expect(
      spriteWidth(sprite),
      `${theme.id}.player.${frame} width`,
    ).toBeLessThanOrEqual(PLAYER_DIM.width + widthTolerance)
  }
}

describe('shibuya theme', () => {
  it('fills every engine slot with sprite dimensions the engine expects', () => {
    assertThemeShape(SHIBUYA_THEME)
  })
})

describe('sicily theme', () => {
  it('fills every engine slot with sprite dimensions the engine expects', () => {
    assertThemeShape(SICILY_THEME)
  })
})
