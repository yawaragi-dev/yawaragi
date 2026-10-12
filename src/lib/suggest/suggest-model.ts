/**
 * The model behind the suggest tool loop, and its list prices.
 *
 * Kept out of `suggest-action.ts` because a `'use server'` file may export
 * only async functions, and the eval runner needs the id and the prices to
 * label and cost a run. Change the id on eval numbers, not on a version
 * number: `pnpm eval suggest-jp` before and after (see CLAUDE.md, "Model
 * versions").
 */
export const SUGGEST_MODEL = 'claude-haiku-5-5'

/**
 * US dollars per million tokens — list prices on 2026-10-12. Cache writes
 * cost 125% of input and cache reads 10%, for every model.
 */
export const SUGGEST_MODEL_PRICES: Record<string, { input: number; output: number }> = {
  'claude-haiku-4-5': { input: 1, output: 5 },
  'claude-haiku-5-5': { input: 0.1, output: 0.5 },
  'claude-sonnet-5-5': { input: 2, output: 10 },
}
