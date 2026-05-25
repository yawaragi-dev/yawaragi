/**
 * Single source of truth for which theme the 404-page mini-game wears.
 *
 * Flip this constant to switch the visual surface (sprites, colours,
 * music) and the i18n copy (player/obstacle names, hints) without
 * touching any other file. The engine in `engine.ts` is theme-agnostic;
 * obstacle and milestone kinds are abstract slots that each theme fills.
 *
 * The Shibuya theme (Tokyo salaryman) was the original; the Sicily
 * theme (pizzaiolo) shipped second and is the current default.
 */

import { SHIBUYA_THEME } from './themes/shibuya'
import { SICILY_THEME } from './themes/sicily'
import type { Theme } from './themes/types'

export type ThemeId = 'shibuya' | 'sicily'

/** Flip this constant to switch themes. */
export const ACTIVE_THEME_ID: ThemeId = 'sicily'

const THEMES: Record<ThemeId, Theme> = {
  shibuya: SHIBUYA_THEME,
  sicily: SICILY_THEME,
}

export const ACTIVE_THEME: Theme = THEMES[ACTIVE_THEME_ID]
