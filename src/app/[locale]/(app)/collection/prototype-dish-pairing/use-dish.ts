'use client'

import { useState } from 'react'
import type { DishId } from './pick-for-dish'

/**
 * PROTOTYPE — the chosen dish, in memory, mirrored into `?dish=` with
 * `history.replaceState` so a reload or a shared link keeps it. Nothing is
 * stored anywhere else: the real feature keeps no record of the dish.
 */
export function useDish(initial: DishId | null) {
  const [dish, setDish] = useState<DishId | null>(initial)
  const choose = (next: DishId | null) => {
    setDish(next)
    const url = new URL(window.location.href)
    if (next) url.searchParams.set('dish', next)
    else url.searchParams.delete('dish')
    window.history.replaceState(window.history.state, '', url)
  }
  return [dish, choose] as const
}
