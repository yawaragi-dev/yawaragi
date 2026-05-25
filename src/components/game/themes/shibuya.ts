/**
 * Shibuya theme — the original. Tokyo salaryman dodging beer / sake /
 * Strong Zero on the way to the last train. Pure data; no music track
 * (the synthesised SFX from `sounds.ts` cover this theme).
 */

import {
  BEER,
  BOSS_LANTERN,
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
} from '../sprites'
import type { Theme } from './types'

export const SHIBUYA_THEME: Theme = {
  id: 'shibuya',
  obstacles: {
    beer: BEER,
    sake: SAKE,
    strongzero: STRONG_ZERO,
    boss: BOSS_LANTERN,
  },
  milestones: {
    hachiko: HACHIKO,
    scramble: SCRAMBLE,
    tower: TOWER,
    train: TRAIN,
  },
  player: {
    jumping: SALARYMAN_JUMPING,
    runA: SALARYMAN_RUN_A,
    runB: SALARYMAN_RUN_B,
  },
  skyline: SKYLINE_BUILDINGS,
  colors: {
    skyTop: '#1e1b4b', // indigo-950 — Tokyo night sky
    skyMid: '#7c2d12', // orange-900 — sunset transition
    skyBottom: '#f97316', // orange-500 — sunset glow
    ground: '#18181b', // zinc-900 asphalt
    groundLine: '#d4d4d8', // zinc-300
    rail: '#71717a', // zinc-500
  },
}
