import type { GroundTruthEntry } from './schemas'

/**
 * Phase 4 / S7 (#145) — ground-truth Sakenowa brand IDs per query.
 *
 * How the sets were built (per-query type):
 *
 *   1. **Seed-based** — Euclidean k=8 neighbours in the 6-axis space
 *      from the local Sakenowa mirror. This is a proxy for what MCP's
 *      `find_similar_sakes` returns (which uses cosine, not
 *      Euclidean); the overlap between them is high in practice
 *      because the axis vectors are unit-boxed in [0,1] and the top-K
 *      neighbourhoods coincide. If a future eval run consistently
 *      shows recall < 30% on seed queries, re-generate the set from
 *      the actual MCP tool output — the mirror may have shifted.
 *
 *   2. **Bottle-name freeform** — a manual `search brands where
 *      name_romaji ILIKE '%X%' OR name = '<kanji>'` against the
 *      mirror at eval-build time. Sizes are small (1–3 brands) — a
 *      bottle-name search is inherently narrow.
 *
 *   3. **Descriptor freeform** — top-N brands from the mirror that
 *      satisfy the axis predicate implied by the phrase (e.g.
 *      `f1 > 0.5 AND f6 > 0.3 AND f2 < 0.5` for "light and floral").
 *      The set is deliberately WIDER than K=5 so that partial
 *      overlap counts as recall — a descriptor phrase has no
 *      "single right answer".
 *
 *   4. **Cross-beverage freeform** — top-N brands whose axes match
 *      the cross-beverage table row for that descriptor
 *      (`src/lib/ai/tools/cross-beverage-data.ts`). Also wider than
 *      K=5 for the same reason.
 *
 * All brand IDs verified present in `flavor_charts` at eval-build time
 * (2026-07-05). A future ingest might add new brands to these sets;
 * the eval doesn't care — recall is `intersect / expected.length`, so
 * extra returned brands don't penalise, and extra expected brands
 * just widen the pass zone.
 */
export const GROUND_TRUTH: readonly GroundTruthEntry[] = [
  // ============================================================
  // Seed-based — Euclidean k=8 neighbours from local mirror.
  // ============================================================
  {
    queryId: 'seed-dassai',
    expectedBrandIds: [2601, 3344, 454, 621, 660, 648, 1033, 1617],
    rationale:
      'Top-8 Euclidean neighbours of brand 887 (獺祭/Dassai) in 6-axis space. Next5, Haroka, Haneyaya, Yamazaki Jozo, Jikon, Suzukagawa, Saku, Sato Ubei.',
  },
  {
    queryId: 'seed-kubota',
    expectedBrandIds: [410, 66, 4, 253, 606, 941, 3669, 2424],
    rationale:
      'Top-8 Euclidean neighbours of brand 431 (久保田/Kubota). Shimebariizuru, Soten Den, Takarakawa, Daina, Shidaizumi, Kikusui, Chomeiizumi, Hakonesan — the Niigata tanrei-karakuchi cohort.',
  },
  {
    queryId: 'seed-hakkaisan',
    expectedBrandIds: [3078, 53, 1611, 902, 446, 2239, 1764, 498],
    rationale:
      'Top-8 Euclidean neighbours of brand 380 (八海山/Hakkaisan). Tateyama, Tenjou Mugen, Niseko, Yukisuzaku, Maboroshi no Taki, Hakugan Masamune, Kaga no I, Hayaseura.',
  },
  {
    queryId: 'seed-kokuryu',
    expectedBrandIds: [2796, 3552, 3319, 4439, 871, 643, 2854, 1070],
    rationale:
      'Top-8 Euclidean neighbours of brand 522 (黒龍/Kokuryu). Sakurafubuki, Bishio, Ryuu ga Sawa, Gokeiji, Ugo no Tsuki, Tamitsu, Hoyo, Toyohai.',
  },

  // ============================================================
  // Bottle-name freeform — manual mirror lookup.
  // ============================================================
  {
    queryId: 'freeform-dassai',
    expectedBrandIds: [887],
    rationale: 'Sole 獺祭 brand row in the mirror (as of 2026-07-05).',
  },
  {
    queryId: 'freeform-kubota',
    expectedBrandIds: [431, 3930],
    rationale:
      '431 = base 久保田. 3930 = 久保田 紅寿 (Kubota Akaju series bottle). Both are correct hits for a "Kubota" query.',
  },
  {
    queryId: 'freeform-hakkaisan',
    expectedBrandIds: [380, 331],
    rationale:
      '380 = base 八海山. 331 = 雪の八海 (Yuki no Hakkaisan) — same brewery satellite line, romaji contains "Hakkaisan".',
  },
  {
    queryId: 'freeform-juyondai-kanji',
    expectedBrandIds: [144],
    rationale: 'Sole 十四代 brand row. Direct kanji match.',
  },

  // ============================================================
  // Descriptor freeform — top-N brands satisfying the axis predicate.
  // ============================================================
  {
    queryId: 'freeform-light-floral',
    expectedBrandIds: [1386, 161, 2589, 69509, 2471, 3745, 45799, 109882, 3373],
    rationale:
      'Top-9 brands with f1 > 0.5 AND f6 > 0.3 AND f2 < 0.5 — the "hanayaka + keikai, restrained hojun" cluster. Suzune, Hitotoki, Nene, Yuma, Ryo, Domuroku, Ubusuna, Etsuichi, Kabutomushi.',
  },
  {
    queryId: 'freeform-mellow-rich',
    expectedBrandIds: [2692, 248, 1695, 2780, 72187, 2136, 1692, 1766, 2397, 1684],
    rationale:
      'Top-10 brands with f2 > 0.5 AND f3 > 0.3 AND f5 < 0.4 — the "hojun + juko, not dry" koshu / aged cluster. Daruma Masamune (both rows), Hanakai, Mantensei, Nihon Tamashii, Debut, afs, Ine Mankai, Shirakaage Izumi, Kintoro.',
  },
  {
    queryId: 'freeform-dry-crisp',
    expectedBrandIds: [2081, 67218, 76068, 591, 1219, 421, 3254, 944, 162, 1188],
    rationale:
      'Top-10 brands with f5 > 0.5 AND f6 > 0.4 AND f2 < 0.4 — the "dry + keikai, restrained hojun" cluster. Kappa, Aoringo Pompom, Senchuhassaku, Sansen Sakari, Bakuren, Sotenpou, Eibokuya, Shimanto, Yamahohshi, Ryoga.',
  },
  {
    queryId: 'freeform-aromatic-fragrant',
    expectedBrandIds: [2471, 2317, 2456, 1179, 1332, 161, 1386, 2589, 3373, 69509],
    rationale:
      'Top-10 brands with f1 > 0.5 (hanayaka anchor). Ryo, Arroz, Sekizen, Kayouyoku, Kunheki, Hitotoki, Suzune, Nene, Kabutomushi, Yuma.',
  },

  // ============================================================
  // Cross-beverage freeform — top-N brands matching cross-bev axes.
  // ============================================================
  {
    queryId: 'freeform-smoky-whisky',
    expectedBrandIds: [1300, 490, 1265, 141, 4164, 3714, 783, 1721],
    rationale:
      'Top-8 brands with f2 > 0.5 AND f3 > 0.4 AND f5 > 0.35 AND f6 < 0.35 — matching the smoky-whisky cross-bev row (f2=0.75, f3=0.72, f5=0.70, f6=0.18). Tachiyama, Kurokutai, Sennyo Otokoyama, Sumiyoshi, Mansei, Kamikumige, Oku Harima, Hatsugasumi.',
  },
  {
    queryId: 'freeform-hoppy-ipa',
    expectedBrandIds: [3015, 36678, 1136, 577, 640, 171, 1340, 1750, 945, 2770],
    rationale:
      'Top-10 brands with f1 > 0.45 AND f5 > 0.3 AND f6 > 0.4 — matching the hoppy-west-coast cross-bev row (f1=0.85, f5=0.70, f6=0.65). Sharakuemon, Juichisho Masamune, Kinoe, Yamasha, Mie no Kanbaai, Gasan-ryu, Seiko, Toyonō Ume, Bitanfu, Kinoene.',
  },
  {
    queryId: 'freeform-tannic-wine',
    expectedBrandIds: [2692, 2780, 1695, 2397, 1398, 248, 72187, 1684, 79465, 2383],
    rationale:
      'Top-10 brands with f2 > 0.5 AND f3 > 0.4 AND f6 < 0.35 — matching the tannic-wine cross-bev row (f2=0.75, f3=0.72, f6=0.20). Overlaps significantly with the mellow-rich cluster because tannic-wine and mellow-rich sit in adjacent axis zones.',
  },
]
