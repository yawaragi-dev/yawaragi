/**
 * Sicily theme — a pizzaiolo running through a Mediterranean coastal town,
 * evading rolling pizzas, arancini, and cannoli on the way to a roaring
 * wood-fired oven (the boss). Background music is a fast 6/8 tarantella
 * (see `sicily-music.ts`), played only when the user enables sound.
 */

import { SICILY_MUSIC } from './sicily-music'
import {
  ARANCINO,
  BOSS_OVEN,
  CAMPANILE_SPRITE,
  CANNOLO,
  COBBLES,
  ETNA,
  PIZZA,
  PIZZAIOLO_JUMPING,
  PIZZAIOLO_RUN_A,
  PIZZAIOLO_RUN_B,
  SKYLINE_SICILY,
  VESPA,
} from './sicily-sprites'
import type { Theme } from './types'

export const SICILY_THEME: Theme = {
  id: 'sicily',
  obstacles: {
    beer: PIZZA,
    sake: CANNOLO,
    strongzero: ARANCINO,
    boss: BOSS_OVEN,
  },
  milestones: {
    hachiko: VESPA,
    scramble: COBBLES,
    tower: CAMPANILE_SPRITE,
    train: ETNA,
  },
  player: {
    jumping: PIZZAIOLO_JUMPING,
    runA: PIZZAIOLO_RUN_A,
    runB: PIZZAIOLO_RUN_B,
  },
  skyline: SKYLINE_SICILY,
  colors: {
    skyTop: '#0c4a6e', // sky-900 — pre-dawn deep blue
    skyMid: '#f97316', // orange-500 — sunrise band
    skyBottom: '#fde047', // yellow-300 — Mediterranean haze at horizon
    ground: '#78350f', // amber-900 — dusty Sicilian earth
    groundLine: '#fde68a', // amber-200 — sunlit dirt edge
    // Sicily has no railway under the chase — `rail` is intentionally
    // omitted so the runner skips the train-rail flourish.
  },
  music: SICILY_MUSIC,
}
