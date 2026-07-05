import type { Query } from './schemas'

/**
 * Phase 4 / S7 (#145) — the 15 seed queries for `evals/suggest-jp/`.
 *
 * Distribution matches the shape of what real visitors type on
 * `/[locale]/suggest`:
 *
 *   - **Seed-based (4)** — the "Find similar" affordance from
 *     `/sake/[brandId]`. Anchors are well-known bottles (Dassai,
 *     Kubota, Hakkaisan, Kokuryu) that also happen to have flavor
 *     charts in the Sakenowa mirror (brand 1 / 新十津川 is chart-
 *     less, so it's out of the harness).
 *   - **Bottle-name freeform (4)** — visitors typing a specific
 *     name. The right MCP tool is `search_sakes_by_name`.
 *   - **Descriptor freeform (4)** — flavor-vocabulary phrases
 *     ("light and floral", "mellow and rich"). The right MCP tool
 *     is `find_sakes_by_flavor` with axis ranges derived from the
 *     phrase.
 *   - **Cross-beverage freeform (3)** — Western-descriptor bridges
 *     ("smoky whisky", "hoppy IPA"). The LLM should first call
 *     `mapCrossBeverage`, then feed its returned axes into
 *     `find_sakes_by_flavor`. This is the load-bearing S6 story.
 *
 * See `ground-truth.ts` for the expected-brand-id sets and the
 * per-query rationale.
 */
export const QUERIES: readonly Query[] = [
  // ============================================================
  // Seed-based — "Find similar" from a sake detail page.
  // ============================================================
  {
    id: 'seed-dassai',
    mode: 'seed',
    brandId: 887,
    notes: '獺祭 / Dassai (Yamaguchi). Recruiter-anchor bottle. High f1/f6, low f3.',
  },
  {
    id: 'seed-kubota',
    mode: 'seed',
    brandId: 431,
    notes: '久保田 / Kubota (Niigata). Classic Niigata tanrei-karakuchi (clean, dry) profile.',
  },
  {
    id: 'seed-hakkaisan',
    mode: 'seed',
    brandId: 380,
    notes: '八海山 / Hakkaisan (Niigata). Another tanrei anchor, distinct from Kubota.',
  },
  {
    id: 'seed-kokuryu',
    mode: 'seed',
    brandId: 522,
    notes: '黒龍 / Kokuryu (Fukui). Elegant, medium-body, aromatic finish.',
  },

  // ============================================================
  // Bottle-name freeform — the LLM should call search_sakes_by_name.
  // ============================================================
  {
    id: 'freeform-dassai',
    mode: 'freeform',
    query: 'Dassai',
    notes: 'Romaji bottle name lookup. Only one brand row matches.',
  },
  {
    id: 'freeform-kubota',
    mode: 'freeform',
    query: 'Kubota',
    notes:
      'Romaji bottle name. Multiple matches: the base Kubota brand (431) and a series bottle (3930 Kubota Akaju).',
  },
  {
    id: 'freeform-hakkaisan',
    mode: 'freeform',
    query: 'Hakkaisan',
    notes: 'Romaji + the "Yuki no Hakkaisan" 雪の八海 satellite (331) both count.',
  },
  {
    id: 'freeform-juyondai-kanji',
    mode: 'freeform',
    query: '十四代',
    notes:
      'Kanji bottle name lookup. Juyondai is one of the most sought-after sakes; visitors will type it in kanji.',
  },

  // ============================================================
  // Descriptor freeform — the LLM should map to axes + call find_sakes_by_flavor.
  // ============================================================
  {
    id: 'freeform-light-floral',
    mode: 'freeform',
    query: 'light and floral',
    notes:
      'Maps to high f1 (hanayaka, fragrant) + high f6 (keikai, light/crisp). Non-obvious for a fresh model; forces the phrase→axis reasoning step.',
  },
  {
    id: 'freeform-mellow-rich',
    mode: 'freeform',
    query: 'mellow and rich',
    notes:
      'Maps to high f2 (hojun, mellow/rich) + mid f3 (juko, heavy) + low f5 (dry). The classic junmai-koshu profile.',
  },
  {
    id: 'freeform-dry-crisp',
    mode: 'freeform',
    query: 'dry and crisp',
    notes: 'Maps to high f5 (dry) + high f6 (keikai). The Niigata tanrei-karakuchi target zone.',
  },
  {
    id: 'freeform-aromatic-fragrant',
    mode: 'freeform',
    query: 'aromatic and fragrant',
    notes:
      'Maps to very high f1 (hanayaka). Tests axis-vocabulary recognition — "aromatic" and "fragrant" are the two English glosses for the same axis.',
  },

  // ============================================================
  // Cross-beverage freeform — the LLM should call mapCrossBeverage.
  // ============================================================
  {
    id: 'freeform-smoky-whisky',
    mode: 'freeform',
    query: 'smoky whisky',
    notes:
      'The "I like smoky whisky → give me sake" recruiter-demo path. Should trigger mapCrossBeverage(descriptor=smoky, beverage=whisky) → high f2/f3/f5, low f6.',
  },
  {
    id: 'freeform-hoppy-ipa',
    mode: 'freeform',
    query: 'hoppy IPA',
    notes:
      'S6 (#144) post-merge regression case: "IPA" and "hoppy" both got aliases to hoppy-west-coast. Should map to high f1 + f6.',
  },
  {
    id: 'freeform-tannic-wine',
    mode: 'freeform',
    query: 'tannic red wine',
    notes:
      'Cross-beverage: tannic → wine. Should trigger mapCrossBeverage(descriptor=tannic, beverage=wine) → rich, heavy, low crisp.',
  },
]
