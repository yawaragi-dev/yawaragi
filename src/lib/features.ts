/**
 * Compile-time switches for surfaces that are designed but have nothing real
 * behind them yet.
 *
 * Design v1.4 rule 4 says missing data is stated, not hidden — and for a
 * section whose data MIGHT be missing for one bottle (a spec field, a chart)
 * that still holds. These are different: no bottle has them, because no source
 * exists yet, so an empty-state sentence on every page states nothing about
 * the sake and only advertises a feature we have not built. The maintainer's
 * call is to hide them until they are real.
 *
 * Each flag names its issue. Turning one on is the last step of that issue,
 * not a way to preview it.
 */
export const FEATURES = {
  /** §9.4 "Serve it" — serving temperatures on the bottle page. #340 */
  bottleServing: false,
  /** §9.5 "The sake" — brewing specs (rice, polishing, yeast, SMV). #339 */
  bottleSpecs: false,
  /** §9.7 "Goes with" — food pairings on the bottle page. #336 */
  bottlePairings: false,
  /** §9.8 "What others noticed" — community tasting notes. #337 */
  bottleCommunityNotes: false,
  /** §9.10 "Where to find it" — shops and venues. #338 */
  bottleShops: false,
} as const
