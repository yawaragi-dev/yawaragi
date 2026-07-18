/**
 * Theme contract for the 404-page mini-game.
 *
 * A theme is a pure-data bundle of sprites, colours, an optional looping
 * music track, and an i18n key. The engine (`engine.ts`) stays theme-agnostic
 * — obstacle and milestone kinds remain the abstract slots `'beer' | 'sake'
 * | 'strongzero' | 'boss'` and `'hachiko' | 'scramble' | 'tower' | 'train'`.
 * Each theme provides sprites that fill those slots with whatever visual
 * makes sense for its setting (Tokyo salaryman, Sicilian pizzaiolo, etc).
 */

import type { MilestoneKind, ObstacleKind } from '../engine'
import type { SoundEngine } from '../sounds'
import type { Sprite } from '../sprites'

export interface ThemeColors {
  /** Top of the sky gradient. */
  skyTop: string
  /** Mid colour of the sky gradient (between top and bottom). */
  skyMid: string
  /** Bottom of the sky gradient. */
  skyBottom: string
  /** Asphalt / ground band colour. */
  ground: string
  /** Crisp ground horizon line. */
  groundLine: string
  /**
   * Optional rail / parallax stripe colour. When omitted the runner omits
   * the train-rail flourish (Sicily has no railway under the chase).
   */
  rail?: string
}

export interface ThemePlayerFrames {
  /** Frame shown when the player is airborne. */
  jumping: Sprite
  /** First run-cycle frame. */
  runA: Sprite
  /** Second run-cycle frame. */
  runB: Sprite
}

/**
 * Background music driver. The renderer calls `start()` when the user
 * enables sound and `stop()` when sound is disabled or the component
 * unmounts. Implementations should be idempotent (multiple start calls do
 * not stack notes).
 */
export interface ThemeMusic {
  start(engine: SoundEngine): void
  stop(): void
}

export interface Theme {
  /** Stable identifier; surfaces in i18n keys (`notFound.game.themes.<id>`). */
  id: 'shibuya' | 'sicily'
  /** Sprite for each obstacle slot the engine spawns. */
  obstacles: Record<ObstacleKind, Sprite>
  /** Sprite for each milestone slot the engine spawns. */
  milestones: Record<MilestoneKind, Sprite>
  /** Player run/jump frames. All must share dimensions with the salaryman set. */
  player: ThemePlayerFrames
  /** Background skyline sprite, tiled horizontally at parallax speed. */
  skyline: Sprite
  colors: ThemeColors
  /** Optional looping background track. */
  music?: ThemeMusic
}
