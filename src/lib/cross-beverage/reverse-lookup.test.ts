import { describe, expect, it } from 'vitest'
import type { CrossBeverageMap } from '@/lib/schemas/cross-beverage-map'
import {
  REVERSE_MATCH_THRESHOLD,
  findNearestExemplars,
  flavorDistance,
} from './reverse-lookup'

// A minimal fixture table so the tests pin behaviour against pre-computed
// distances rather than the shipped 62-row `CROSS_BEVERAGE_MAP`. This
// prevents the test from becoming a change-detector every time the
// research doc gets re-tuned.
//
// The three fixture rows sit at deliberately separated corners of the
// 6-axis cube so the L2-distance math is easy to reason about by hand:
//
//   - `peated`     (whisky, Yamahai anchor)      — heavy / umami / low-crisp
//   - `hoppy`      (beer, IPA anchor)            — aromatic / dry / crisp
//   - `sparkling`  (wine, Champagne anchor)      — aromatic / very dry / very crisp
const FIXTURE_ROWS: readonly CrossBeverageMap[] = [
  {
    source: 'cross_beverage_map',
    descriptor: 'peated',
    beverage: 'whisky',
    f1: 0.1,
    f2: 0.8,
    f3: 0.75,
    f4: 0.2,
    f5: 0.7,
    f6: 0.15,
    exemplars: [
      { source: 'manual_curation', name: 'Lagavulin 16', region: 'Islay peated single-malt' },
    ],
  },
  {
    source: 'cross_beverage_map',
    descriptor: 'hoppy',
    beverage: 'beer',
    f1: 0.85,
    f2: 0.4,
    f3: 0.25,
    f4: 0.2,
    f5: 0.7,
    f6: 0.65,
    exemplars: [
      { source: 'manual_curation', name: 'West Coast IPA', region: 'Hoppy citrus-pine IPA' },
    ],
  },
  {
    source: 'cross_beverage_map',
    descriptor: 'sparkling',
    beverage: 'wine',
    f1: 0.65,
    f2: 0.3,
    f3: 0.2,
    f4: 0.4,
    f5: 0.85,
    f6: 0.85,
    exemplars: [
      {
        source: 'manual_curation',
        name: 'Brut Champagne',
        region: 'Méthode traditionnelle sparkling',
      },
    ],
  },
]

describe('flavorDistance', () => {
  // A change to the distance formula (e.g. someone swapping L2 for
  // Manhattan) would break every one of these assertions — the test would
  // fail on math, not on the choice of a helper. That's the point.

  it('returns 0 for two identical vectors', () => {
    const a = { f1: 0.5, f2: 0.5, f3: 0.5, f4: 0.5, f5: 0.5, f6: 0.5 }
    expect(flavorDistance(a, a)).toBe(0)
  })

  it('is symmetric: d(a, b) === d(b, a)', () => {
    const a = { f1: 0.1, f2: 0.2, f3: 0.3, f4: 0.4, f5: 0.5, f6: 0.6 }
    const b = { f1: 0.6, f2: 0.5, f3: 0.4, f4: 0.3, f5: 0.2, f6: 0.1 }
    expect(flavorDistance(a, b)).toBeCloseTo(flavorDistance(b, a), 12)
  })

  it('computes the Euclidean distance between two known-different vectors', () => {
    // Difference vector [0.3, 0.4, 0, 0, 0, 0] → L2 = sqrt(0.09 + 0.16) = 0.5
    const a = { f1: 0.1, f2: 0.2, f3: 0.5, f4: 0.5, f5: 0.5, f6: 0.5 }
    const b = { f1: 0.4, f2: 0.6, f3: 0.5, f4: 0.5, f5: 0.5, f6: 0.5 }
    expect(flavorDistance(a, b)).toBeCloseTo(0.5, 10)
  })

  it('reaches sqrt(6) for opposite corners of the unit cube', () => {
    // Every axis differs by 1 → L2 = sqrt(6). Sanity-checks the upper
    // bound: a real flavor profile in [0, 1]^6 can never exceed this.
    const zeros = { f1: 0, f2: 0, f3: 0, f4: 0, f5: 0, f6: 0 }
    const ones = { f1: 1, f2: 1, f3: 1, f4: 1, f5: 1, f6: 1 }
    expect(flavorDistance(zeros, ones)).toBeCloseTo(Math.sqrt(6), 10)
  })
})

describe('findNearestExemplars', () => {
  it('returns the exemplar of the closest row when the profile matches one anchor', () => {
    // A profile that IS the `peated` anchor should surface Lagavulin 16
    // with distance 0.
    const profile = {
      f1: 0.1,
      f2: 0.8,
      f3: 0.75,
      f4: 0.2,
      f5: 0.7,
      f6: 0.15,
    }
    const result = findNearestExemplars(profile, { rows: FIXTURE_ROWS })
    expect(result.kind).toBe('match')
    if (result.kind !== 'match') return
    expect(result.hits[0]?.exemplar.name).toBe('Lagavulin 16')
    expect(result.hits[0]?.distance).toBeCloseTo(0, 10)
  })

  it('returns the top 1–2 hits ordered by ascending distance', () => {
    // A profile slightly off the `hoppy` anchor. hoppy should be closest,
    // sparkling second (both aromatic + crisp poles), peated furthest.
    const profile = {
      f1: 0.8,
      f2: 0.45,
      f3: 0.3,
      f4: 0.25,
      f5: 0.7,
      f6: 0.6,
    }
    const result = findNearestExemplars(profile, { rows: FIXTURE_ROWS })
    expect(result.kind).toBe('match')
    if (result.kind !== 'match') return
    expect(result.hits.length).toBeGreaterThan(0)
    expect(result.hits.length).toBeLessThanOrEqual(2)
    expect(result.hits[0]?.exemplar.name).toBe('West Coast IPA')
    // Distances must be monotonically non-decreasing.
    for (let i = 1; i < result.hits.length; i++) {
      expect(result.hits[i]!.distance).toBeGreaterThanOrEqual(result.hits[i - 1]!.distance)
    }
  })

  it('returns "no-close-analog" for a profile beyond the threshold', () => {
    // A delicate mid-value profile with no dominant axis — the sort of
    // Junmai Daiginjo that legitimately has no Western analog. Distances
    // to every fixture row should exceed the default threshold.
    const profile = {
      f1: 0.5,
      f2: 0.5,
      f3: 0.5,
      f4: 0.5,
      f5: 0.5,
      f6: 0.5,
    }
    const result = findNearestExemplars(profile, { rows: FIXTURE_ROWS })
    expect(result.kind).toBe('no-close-analog')
  })

  it('respects a caller-supplied threshold override', () => {
    const profile = {
      f1: 0.1,
      f2: 0.8,
      f3: 0.75,
      f4: 0.2,
      f5: 0.7,
      f6: 0.15,
    }
    // Threshold 0 → only exact anchors count. profile IS peated → still
    // matches. But sparkling/hoppy are far away → still no additional hits.
    const result = findNearestExemplars(profile, {
      rows: FIXTURE_ROWS,
      threshold: 0,
    })
    expect(result.kind).toBe('match')
    if (result.kind !== 'match') return
    expect(result.hits.map((h) => h.exemplar.name)).toEqual(['Lagavulin 16'])
  })

  it('respects a caller-supplied maxHits override', () => {
    // With a large threshold every row matches; maxHits=1 caps to a single hit.
    const profile = {
      f1: 0.1,
      f2: 0.8,
      f3: 0.75,
      f4: 0.2,
      f5: 0.7,
      f6: 0.15,
    }
    const result = findNearestExemplars(profile, {
      rows: FIXTURE_ROWS,
      threshold: 10,
      maxHits: 1,
    })
    expect(result.kind).toBe('match')
    if (result.kind !== 'match') return
    expect(result.hits.length).toBe(1)
  })

  it('deduplicates exemplars sharing a primary name across descriptors', () => {
    // Real-world case: `peated` and `smoky` both list Lagavulin 16 first.
    // When both match, the visitor should see one Lagavulin 16 hit, not
    // two — the second is not additional information.
    const rowsWithDup: readonly CrossBeverageMap[] = [
      FIXTURE_ROWS[0]!, // peated → Lagavulin 16
      {
        ...FIXTURE_ROWS[0]!,
        descriptor: 'smoky',
        // Same anchor exemplar, deliberately identical primary name.
        exemplars: [
          { source: 'manual_curation', name: 'Lagavulin 16', region: 'Islay peated single-malt' },
        ],
        // Slightly perturbed axes so this row's distance is > 0 while
        // still being within threshold; the sort places `peated` first
        // and this row second where dedup would drop it.
        f1: 0.12,
        f5: 0.72,
      },
    ]
    const profile = {
      f1: 0.1,
      f2: 0.8,
      f3: 0.75,
      f4: 0.2,
      f5: 0.7,
      f6: 0.15,
    }
    const result = findNearestExemplars(profile, { rows: rowsWithDup })
    expect(result.kind).toBe('match')
    if (result.kind !== 'match') return
    const names = result.hits.map((h) => h.exemplar.name)
    expect(new Set(names).size).toBe(names.length)
    expect(names).toEqual(['Lagavulin 16'])
  })

  // A single-row fixture anchored at the origin of the 6-axis cube. A
  // profile that differs from it on ONLY f1 has L2 distance == |f1|, so we
  // can place a profile at an exactly-controlled distance from the anchor
  // and probe the threshold gate to the ULP. `Math.sqrt(0.55 * 0.55)`
  // rounds to exactly 0.55 in IEEE-754 doubles, so a profile at f1 = 0.55
  // sits precisely ON the shipped threshold.
  const ORIGIN_ROW: readonly CrossBeverageMap[] = [
    {
      source: 'cross_beverage_map',
      descriptor: 'peated',
      beverage: 'whisky',
      f1: 0,
      f2: 0,
      f3: 0,
      f4: 0,
      f5: 0,
      f6: 0,
      exemplars: [
        { source: 'manual_curation', name: 'Lagavulin 16', region: 'Islay peated single-malt' },
      ],
    },
  ]

  it('treats a distance exactly equal to the shipped threshold as a match (gate is inclusive <=)', () => {
    // Regression guard: fails if someone flips the `<=` distance gate in
    // findNearestExemplars to `<`. The profile sits at L2 distance
    // 0.55 == REVERSE_MATCH_THRESHOLD from the anchor; an inclusive gate
    // must surface the exemplar, an exclusive one would drop it to
    // 'no-close-analog'. Uses the DEFAULT (shipped) threshold on purpose,
    // so this ALSO fails if the shipped 0.55 is LOWERED: at threshold 0.5
    // the exactly-0.55 distance falls out of the gate.
    const onThreshold = { f1: 0.55, f2: 0, f3: 0, f4: 0, f5: 0, f6: 0 }
    expect(flavorDistance(onThreshold, ORIGIN_ROW[0]!)).toBe(REVERSE_MATCH_THRESHOLD)
    const result = findNearestExemplars(onThreshold, { rows: ORIGIN_ROW })
    expect(result.kind).toBe('match')
    if (result.kind !== 'match') return
    expect(result.hits[0]?.exemplar.name).toBe('Lagavulin 16')
  })

  it('drops a distance just over the shipped threshold to no-close-analog', () => {
    // Regression guard: fails if someone RAISES the shipped 0.55 (e.g. to
    // 0.6), which would pull this just-over profile back into a match. The
    // distance is one nudge above the shipped threshold, so with the
    // correct 0.55 it must land in the honesty ('no-close-analog') branch.
    const justOver = { f1: 0.55 + 1e-9, f2: 0, f3: 0, f4: 0, f5: 0, f6: 0 }
    expect(flavorDistance(justOver, ORIGIN_ROW[0]!)).toBeGreaterThan(REVERSE_MATCH_THRESHOLD)
    const result = findNearestExemplars(justOver, { rows: ORIGIN_ROW })
    expect(result.kind).toBe('no-close-analog')
  })

  it('keeps a distance just under the shipped threshold as a match', () => {
    // Completes the boundary triple (on / just-over / just-under) so the
    // gate direction is fully pinned: a hair below the shipped 0.55 must
    // still match.
    const justUnder = { f1: 0.55 - 1e-9, f2: 0, f3: 0, f4: 0, f5: 0, f6: 0 }
    expect(flavorDistance(justUnder, ORIGIN_ROW[0]!)).toBeLessThan(REVERSE_MATCH_THRESHOLD)
    const result = findNearestExemplars(justUnder, { rows: ORIGIN_ROW })
    expect(result.kind).toBe('match')
  })

  it('threshold constant sits between adjacent-cluster and different-family distances', () => {
    // Regression guard against a maintainer nudging the threshold above
    // the "different family" band (ADR would be needed) or below the
    // "adjacent cluster" band (breaks the reverse hook for any sake
    // that isn't a bit-perfect match to an anchor).
    //
    // The chosen value MUST leave the peated↔smoky pair matched
    // (adjacent cluster, distance ~0.075 for the shipped data) AND MUST
    // leave the peated↔sparkling pair unmatched (opposite corners,
    // distance ~1.3+ for the fixture data). If a future retune breaks
    // either bound, an ADR should document the new one.
    expect(REVERSE_MATCH_THRESHOLD).toBeGreaterThan(0.1)
    expect(REVERSE_MATCH_THRESHOLD).toBeLessThan(1.0)
  })
})
