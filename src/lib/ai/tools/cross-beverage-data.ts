import { parseCrossBeverageMap, type CrossBeverageMap } from '@/lib/schemas/cross-beverage-map'

/**
 * CROSS_BEVERAGE_MAP — hand-curated heuristic bridging Western beverage
 * descriptors (whisky / wine / beer terms) to positions on Sakenowa's 6-axis
 * `FlavorProfile` (f1 hanayaka, f2 hojun, f3 juko, f4 odayaka, f5 dry, f6 keikai).
 *
 * This is the Phase 4 / S2 deliverable for issue #140, distilled from the
 * research artifact at `docs/research/cross-beverage-map.md` (merged in commit
 * 7b95217). The research lists ~71 beverage exemplars (Lagavulin 16, Sancerre,
 * Hefeweizen, etc.); this module collapses those exemplars into the smaller
 * set of *descriptors* a visitor might actually type (`smoky`, `tannic`,
 * `hoppy-west-coast`, ...).
 *
 * Synthesis method
 * ----------------
 * Each descriptor's 6-axis vector is the unweighted mean of the f1..f6 values
 * from the contributing research rows. The mean was favored over a weighted
 * average because the per-row variance within a descriptor cluster is small
 * (research already grouped by sensory family), and because a future maintainer
 * adjusting one exemplar should produce a predictable shift in the descriptor.
 * The inline comment on each row names the cluster and the research-doc rows
 * that fed it (cited by the descriptive label from the research table — not
 * exact line numbers, so the cite survives doc edits).
 *
 * Descriptor-naming convention
 * ----------------------------
 * - Lowercase, single English word, or hyphenated compound (e.g. `sherry-cask`,
 *   `belgian-tripel`, `hoppy-west-coast`). Schema enforces non-empty string;
 *   this convention is convention-only but matches issue #140's AC.
 * - The `(descriptor, beverage)` pair is unique. A descriptor that means
 *   different things across beverage categories (e.g. `dry` for wine vs beer)
 *   carries the beverage suffix in the cluster comment but not in the
 *   descriptor itself; we use a more specific descriptor instead
 *   (`aromatic-dry`, `stout-dry`) to keep each row unambiguous.
 *
 * Provenance contract
 * -------------------
 * Every row is parsed through `parseCrossBeverageMap`, which pins
 * `source: 'cross_beverage_map'` at the schema seam. The UI is contractually
 * required to render every row of this table behind a `<HeuristicDisclaimer />`
 * (CLAUDE.md "Cross-beverage disclaimers"; ADR-0005).
 *
 * Coverage
 * --------
 * 59 rows: 11 whisky, 17 wine, 14 beer, 11 spirit, 4 fortified, 2 cider.
 * The original Phase 2 stub schema only declared `whisky | wine | beer`; the
 * spirit / fortified / cider rows landed alongside the schema extension in
 * this PR (#150). Per-distillate distinction (tequila vs mezcal vs gin) lives
 * in the descriptor, not the beverage column — see `agave-smoky`,
 * `juniper-botanical`, etc.
 *
 * Existing sherry / port / madeira rows under `beverage: 'wine'` (rows
 * `oxidative`, `dessert`) are deliberately NOT re-tagged as `fortified`.
 * The research doc encoded them under the wine table, the existing rows
 * already cluster oxidative + ultra-sweet correctly, and re-tagging would
 * give the LLM tool two routes to the same cluster. The new `fortified`
 * rows cover Western descriptors the wine table did not (`saline-fortified`
 * for Manzanilla, `port-tawny` / `port-ruby` as port-specific clusters).
 */

const RAW_ROWS: ReadonlyArray<Omit<CrossBeverageMap, 'source'> & { source: 'cross_beverage_map' }> =
  [
    // ----- WHISKY (11 descriptors) ------------------------------------------

    // peated — averaged from Lagavulin 16 (research "Lagavulin 16" row) and
    // Ardbeg 10 (research "Ardbeg 10" row). Yamahai / Kimoto Junmai cluster.
    { source: 'cross_beverage_map', descriptor: 'peated',           beverage: 'whisky', f1: 0.11, f2: 0.80, f3: 0.75, f4: 0.22, f5: 0.70, f6: 0.15 },

    // smoky — broader than `peated`: averaged from Lagavulin, Ardbeg, Talisker
    // ("Talisker 10" row). Slightly lower body / higher dry / fractionally
    // higher f6 than `peated` to reflect Talisker's lifted maritime edge.
    { source: 'cross_beverage_map', descriptor: 'smoky',            beverage: 'whisky', f1: 0.14, f2: 0.75, f3: 0.72, f4: 0.25, f5: 0.70, f6: 0.18 },

    // sherry-cask — averaged from Macallan 12 Sherry Oak and GlenDronach 18
    // Allardice rows. The high-f1/low-f1 split between Macallan (floral
    // sherry-cask Speyside) and GlenDronach (deep oxidative koshu analogue)
    // is intentional: the descriptor covers both poles.
    { source: 'cross_beverage_map', descriptor: 'sherry-cask',      beverage: 'whisky', f1: 0.52, f2: 0.75, f3: 0.60, f4: 0.22, f5: 0.47, f6: 0.24 },

    // bourbon-cask — averaged from Buffalo Trace and Maker's Mark rows.
    // Sweet-edged Daiginjo + softer wheated-bourbon Junmai cluster.
    { source: 'cross_beverage_map', descriptor: 'bourbon-cask',     beverage: 'whisky', f1: 0.48, f2: 0.62, f3: 0.48, f4: 0.40, f5: 0.45, f6: 0.38 },

    // oaky — averaged from Macallan, Buffalo Trace, GlenDronach, Yamazaki 12
    // rows (each whisky example whose Reasoning column foregrounds wood).
    // Pulled lower than sherry-cask alone because bourbon and mizunara
    // contribute lighter f3 to the cluster.
    { source: 'cross_beverage_map', descriptor: 'oaky',             beverage: 'whisky', f1: 0.50, f2: 0.66, f3: 0.58, f4: 0.30, f5: 0.51, f6: 0.31 },

    // honeyed — averaged from Highland Park 12, Hibiki Harmony, and
    // Glenmorangie Original rows. High f1 (floral) + mid f5 + mid f6.
    { source: 'cross_beverage_map', descriptor: 'honeyed',          beverage: 'whisky', f1: 0.65, f2: 0.42, f3: 0.28, f4: 0.38, f5: 0.62, f6: 0.63 },

    // light-grain — averaged from Glenfiddich 12, Auchentoshan 12, Jameson
    // Standard. The "approachable, lightly grain-forward" cluster.
    { source: 'cross_beverage_map', descriptor: 'light-grain',      beverage: 'whisky', f1: 0.48, f2: 0.38, f3: 0.28, f4: 0.55, f5: 0.63, f6: 0.65 },

    // speyside-light — averaged from Glenfiddich 12 and Glenmorangie Original
    // rows (the two pear-vanilla-honey-delicacy Speyside exemplars).
    { source: 'cross_beverage_map', descriptor: 'speyside-light',   beverage: 'whisky', f1: 0.68, f2: 0.35, f3: 0.25, f4: 0.38, f5: 0.62, f6: 0.70 },

    // rye-spicy — single research row (Rittenhouse Rye). Pepper-finish rye
    // is a distinctive enough sensory family to keep as its own descriptor.
    { source: 'cross_beverage_map', descriptor: 'rye-spicy',        beverage: 'whisky', f1: 0.55, f2: 0.55, f3: 0.55, f4: 0.25, f5: 0.65, f6: 0.30 },

    // japanese-mizunara — averaged from Yamazaki 12, Hibiki Harmony, Hakushu
    // 12 rows (all three Japanese whisky exemplars in the research table).
    { source: 'cross_beverage_map', descriptor: 'japanese-mizunara', beverage: 'whisky', f1: 0.55, f2: 0.43, f3: 0.32, f4: 0.43, f5: 0.65, f6: 0.62 },

    // irish-pot-still — single research row (Redbreast 12). Creamy spice +
    // muroka-roundness cluster. Distinct enough from the broader Irish blended
    // (Jameson) row to warrant its own descriptor.
    { source: 'cross_beverage_map', descriptor: 'irish-pot-still',  beverage: 'whisky', f1: 0.65, f2: 0.65, f3: 0.40, f4: 0.35, f5: 0.45, f6: 0.45 },

    // ----- WINE (17 descriptors) --------------------------------------------

    // light-bodied — averaged from Sancerre, Muscadet sur lie, Burgundy Pinot
    // Noir (village) rows. The Pinot row pulls f2/f3 up; Sancerre/Muscadet
    // pull f5/f6 up.
    { source: 'cross_beverage_map', descriptor: 'light-bodied',     beverage: 'wine',   f1: 0.50, f2: 0.42, f3: 0.32, f4: 0.40, f5: 0.73, f6: 0.63 },

    // full-bodied — averaged from Napa Cab, Bordeaux Left Bank, Northern
    // Rhône Syrah rows. The high-f2/f3, low-f6 "weight + savory" cluster.
    { source: 'cross_beverage_map', descriptor: 'full-bodied',      beverage: 'wine',   f1: 0.17, f2: 0.82, f3: 0.82, f4: 0.22, f5: 0.65, f6: 0.12 },

    // tannic — sake has no tannin (research §"Limitations"). The descriptor
    // maps to the same body+umami+low-crispness vector as full-bodied; the
    // HeuristicDisclaimer carries the explanation. Identical vector to
    // `full-bodied` on purpose — both project the same Western dimension
    // onto sake's available axes.
    { source: 'cross_beverage_map', descriptor: 'tannic',           beverage: 'wine',   f1: 0.17, f2: 0.82, f3: 0.82, f4: 0.22, f5: 0.65, f6: 0.12 },

    // mineral — averaged from Chablis and Muscadet sur lie rows. The
    // chalk-driven white cluster: high f4 (restrained aroma), high f5/f6.
    { source: 'cross_beverage_map', descriptor: 'mineral',          beverage: 'wine',   f1: 0.52, f2: 0.32, f3: 0.20, f4: 0.60, f5: 0.82, f6: 0.80 },

    // oaked — averaged from Meursault and California oaked Chardonnay rows.
    // Buttery-leesy + malolactic cluster.
    { source: 'cross_beverage_map', descriptor: 'oaked',            beverage: 'wine',   f1: 0.48, f2: 0.72, f3: 0.52, f4: 0.30, f5: 0.55, f6: 0.32 },

    // unoaked — single research row anchor (Chablis). Lean, mineral, no oak.
    // Kept distinct from `mineral` because oak-presence is a common
    // descriptor on its own.
    { source: 'cross_beverage_map', descriptor: 'unoaked',          beverage: 'wine',   f1: 0.55, f2: 0.35, f3: 0.20, f4: 0.65, f5: 0.80, f6: 0.75 },

    // aromatic-dry — averaged from Sancerre, Marlborough Sauvignon Blanc,
    // dry Mosel Riesling rows. Aromatic intensity + bone-dry + crisp.
    { source: 'cross_beverage_map', descriptor: 'aromatic-dry',     beverage: 'wine',   f1: 0.78, f2: 0.32, f3: 0.20, f4: 0.28, f5: 0.77, f6: 0.82 },

    // off-dry — averaged from off-dry Spätlese Riesling and Vouvray
    // Demi-sec rows. Aromatic with residual sugar.
    { source: 'cross_beverage_map', descriptor: 'off-dry',          beverage: 'wine',   f1: 0.72, f2: 0.50, f3: 0.30, f4: 0.28, f5: 0.38, f6: 0.52 },

    // botrytised — averaged from Sauternes and Ice Wine rows. Concentrated
    // sweet + amino-acid weight cluster. Distinct from generic `dessert`
    // because of the noble-rot honeyed signature.
    { source: 'cross_beverage_map', descriptor: 'botrytised',       beverage: 'wine',   f1: 0.45, f2: 0.75, f3: 0.65, f4: 0.20, f5: 0.07, f6: 0.12 },

    // oxidative — averaged from Fino Sherry, Oloroso Sherry, Orange wine
    // rows. The flor / aged-amber cluster.
    { source: 'cross_beverage_map', descriptor: 'oxidative',        beverage: 'wine',   f1: 0.25, f2: 0.87, f3: 0.72, f4: 0.23, f5: 0.63, f6: 0.17 },

    // dessert — averaged from Pedro Ximénez, Sauternes, Ice Wine, Madeira
    // rows. Broader-than-botrytised: covers ultra-sweet fortified and
    // late-harvest both.
    { source: 'cross_beverage_map', descriptor: 'dessert',          beverage: 'wine',   f1: 0.39, f2: 0.81, f3: 0.75, f4: 0.18, f5: 0.15, f6: 0.09 },

    // jammy — single research row (Zinfandel). Dark fruit + jam + warming.
    { source: 'cross_beverage_map', descriptor: 'jammy',            beverage: 'wine',   f1: 0.65, f2: 0.55, f3: 0.45, f4: 0.20, f5: 0.20, f6: 0.30 },

    // sparkling-brut — single research row (Brut Champagne). Awa-sake
    // méthode traditionnelle direct mapping.
    { source: 'cross_beverage_map', descriptor: 'sparkling-brut',   beverage: 'wine',   f1: 0.65, f2: 0.30, f3: 0.20, f4: 0.40, f5: 0.85, f6: 0.85 },

    // sparkling-natural — single research row (Brut Nature / Pet-Nat).
    // Bodaimoto sparkling sake analogue cluster — funky, cloudy.
    { source: 'cross_beverage_map', descriptor: 'sparkling-natural', beverage: 'wine',   f1: 0.30, f2: 0.75, f3: 0.55, f4: 0.25, f5: 0.55, f6: 0.40 },

    // rosé — single research row (Provençal Rosé). Pale, light, dry,
    // strawberry-aromatic. Nama Junmai Ginjo cluster.
    { source: 'cross_beverage_map', descriptor: 'rose',             beverage: 'wine',   f1: 0.55, f2: 0.40, f3: 0.25, f4: 0.40, f5: 0.60, f6: 0.70 },

    // terroir-earthy — averaged from Burgundy Pinot Noir and Northern Rhône
    // Syrah rows. The earthy / mushroomy / iodine-pepper cluster — distinct
    // from `full-bodied` because the body is lighter and the aromatic is
    // savory rather than tannic-fruit.
    { source: 'cross_beverage_map', descriptor: 'terroir-earthy',   beverage: 'wine',   f1: 0.20, f2: 0.72, f3: 0.65, f4: 0.30, f5: 0.60, f6: 0.18 },

    // funky-natural — averaged from Orange wine and Natural wine (low-
    // intervention red) rows. Wild-yeast / ambient-fermentation cluster.
    { source: 'cross_beverage_map', descriptor: 'funky-natural',    beverage: 'wine',   f1: 0.28, f2: 0.82, f3: 0.65, f4: 0.25, f5: 0.52, f6: 0.22 },

    // ----- BEER (14 descriptors) --------------------------------------------

    // pilsner-clean — single research row (German Pilsner). Tanrei
    // karakuchi cluster — clean dry crisp.
    { source: 'cross_beverage_map', descriptor: 'pilsner-clean',    beverage: 'beer',   f1: 0.35, f2: 0.30, f3: 0.25, f4: 0.65, f5: 0.80, f6: 0.85 },

    // malty — single research row (Munich Helles). Soft-rounded Honjozo
    // cluster.
    { source: 'cross_beverage_map', descriptor: 'malty',            beverage: 'beer',   f1: 0.30, f2: 0.45, f3: 0.40, f4: 0.65, f5: 0.55, f6: 0.55 },

    // dark-roasted — averaged from Czech Dark Lager / Dunkel and Bavarian
    // Schwarzbier rows. Bread-crust + restrained-roast cluster.
    { source: 'cross_beverage_map', descriptor: 'dark-roasted',     beverage: 'beer',   f1: 0.20, f2: 0.60, f3: 0.52, f4: 0.52, f5: 0.52, f6: 0.30 },

    // hoppy-west-coast — single research row (West Coast IPA). High-f1
    // aromatic Junmai Ginjo cluster. (Hop bitterness does NOT transfer —
    // see CrossBeverageMap §Limitations.)
    { source: 'cross_beverage_map', descriptor: 'hoppy-west-coast', beverage: 'beer',   f1: 0.85, f2: 0.40, f3: 0.25, f4: 0.20, f5: 0.70, f6: 0.65 },

    // hazy-citrus — single research row (NEIPA / Hazy IPA). Sango Kura
    // dry-hopped Junmai Ginjo direct-evidence cluster.
    { source: 'cross_beverage_map', descriptor: 'hazy-citrus',      beverage: 'beer',   f1: 0.85, f2: 0.55, f3: 0.35, f4: 0.20, f5: 0.55, f6: 0.50 },

    // hefeweizen-ester — single research row (Hefeweizen). Direct
    // ester-chemistry match between weizen yeast and ginjo yeast.
    { source: 'cross_beverage_map', descriptor: 'hefeweizen-ester', beverage: 'beer',   f1: 0.90, f2: 0.40, f3: 0.20, f4: 0.20, f5: 0.50, f6: 0.65 },

    // witbier-spiced — single research row (Belgian Witbier). Coriander-
    // orange + slight acid cluster.
    { source: 'cross_beverage_map', descriptor: 'witbier-spiced',   beverage: 'beer',   f1: 0.65, f2: 0.45, f3: 0.25, f4: 0.35, f5: 0.60, f6: 0.65 },

    // belgian-tripel — single research row (Belgian Tripel). Banana-pear
    // ester + warming alcohol — Junmai Daiginjo Genshu cluster.
    { source: 'cross_beverage_map', descriptor: 'belgian-tripel',   beverage: 'beer',   f1: 0.80, f2: 0.55, f3: 0.40, f4: 0.25, f5: 0.55, f6: 0.45 },

    // belgian-dark — single research row (Belgian Quadrupel). Dried-fruit
    // + caramel + oxidative koshu-adjacent cluster.
    { source: 'cross_beverage_map', descriptor: 'belgian-dark',     beverage: 'beer',   f1: 0.40, f2: 0.85, f3: 0.80, f4: 0.20, f5: 0.45, f6: 0.10 },

    // sour — averaged from Lambic / Gueuze and Kettle Sour / Berliner
    // Weisse rows. Lactic-and-wild-yeast cluster.
    { source: 'cross_beverage_map', descriptor: 'sour',             beverage: 'beer',   f1: 0.38, f2: 0.58, f3: 0.38, f4: 0.25, f5: 0.50, f6: 0.42 },

    // wild-brett — single research row (American Wild Ale / Brett beer).
    // Bodaimoto wild-microbe cluster.
    { source: 'cross_beverage_map', descriptor: 'wild-brett',       beverage: 'beer',   f1: 0.25, f2: 0.75, f3: 0.55, f4: 0.25, f5: 0.45, f6: 0.20 },

    // stout-dry — single research row (Dry Stout / Guinness). Warmed
    // yamahai cluster.
    { source: 'cross_beverage_map', descriptor: 'stout-dry',        beverage: 'beer',   f1: 0.15, f2: 0.75, f3: 0.65, f4: 0.35, f5: 0.65, f6: 0.20 },

    // imperial-stout — single research row (Imperial Stout). Koshu Genshu
    // cluster — chocolate / coffee / dark fruit at high ABV.
    { source: 'cross_beverage_map', descriptor: 'imperial-stout',   beverage: 'beer',   f1: 0.30, f2: 0.90, f3: 0.90, f4: 0.15, f5: 0.40, f6: 0.05 },

    // porter — single research row (Porter). Honjozo Genshu warmed
    // cluster — softer than stout, more cocoa-malt-drinkable.
    { source: 'cross_beverage_map', descriptor: 'porter',           beverage: 'beer',   f1: 0.20, f2: 0.65, f3: 0.55, f4: 0.45, f5: 0.45, f6: 0.30 },

    // ----- SPIRIT (11 descriptors) ------------------------------------------

    // juniper-botanical — single research row (London Dry Gin / Tanqueray).
    // Gin's juniper-botanical doesn't transfer to a sake axis; mapping rests
    // ONLY on shared aromatic intensity (Daiginjo with peak f1). Carries the
    // disclaimer per CrossBeverageMap §Limitations.
    { source: 'cross_beverage_map', descriptor: 'juniper-botanical', beverage: 'spirit', f1: 0.85, f2: 0.30, f3: 0.20, f4: 0.30, f5: 0.80, f6: 0.80 },

    // botanical-sweet — single research row (Old Tom Gin). Slightly sweetened
    // gin → Junmai Daiginjo with rounded residual character.
    { source: 'cross_beverage_map', descriptor: 'botanical-sweet',  beverage: 'spirit', f1: 0.75, f2: 0.45, f3: 0.30, f4: 0.30, f5: 0.55, f6: 0.55 },

    // botanical-japanese — single research row (Japanese Gin / Roku / Ki No
    // Bi). Yuzu-tea-sansho botanicals find a closer sake analogue than
    // London Dry — yuzu-forward Junmai Ginjo (Kid) cluster.
    { source: 'cross_beverage_map', descriptor: 'botanical-japanese', beverage: 'spirit', f1: 0.80, f2: 0.40, f3: 0.25, f4: 0.30, f5: 0.65, f6: 0.65 },

    // earthy-shochu — single research row (Imo Shochu / sweet potato).
    // Warmed earthy Junmai (Tedorigawa cluster). Roast-sweet-potato + earth +
    // chestnut maps to f2/f3 with low f1/f6.
    { source: 'cross_beverage_map', descriptor: 'earthy-shochu',    beverage: 'spirit', f1: 0.20, f2: 0.70, f3: 0.65, f4: 0.35, f5: 0.65, f6: 0.20 },

    // clean-shochu — single research row (Mugi Shochu / barley). Clean light
    // Honjozo cluster — accessible, mildly sweet, grassy.
    { source: 'cross_beverage_map', descriptor: 'clean-shochu',     beverage: 'spirit', f1: 0.30, f2: 0.35, f3: 0.30, f4: 0.65, f5: 0.70, f6: 0.65 },

    // neutral-soju — single research row (Korean Soju). Smooth-light-neutral
    // with slight sweetness; low-ABV Junmai / light Honjozo cluster.
    { source: 'cross_beverage_map', descriptor: 'neutral-soju',     beverage: 'spirit', f1: 0.30, f2: 0.30, f3: 0.25, f4: 0.60, f5: 0.55, f6: 0.65 },

    // baijiu-funk — single research row (light-aroma baijiu / Erguotou). qu-
    // derived funk + high ABV intensity has no real sake analogue; closest is
    // kimoto Genshu — high amino-acid funk + 18%+ ABV. Match is intensity,
    // not aroma. Carries the disclaimer.
    { source: 'cross_beverage_map', descriptor: 'baijiu-funk',      beverage: 'spirit', f1: 0.20, f2: 0.75, f3: 0.80, f4: 0.20, f5: 0.75, f6: 0.10 },

    // agave-bright — single research row (Tequila Blanco). Bright citrus-
    // pepper-vegetal agave → crisp Junmai Ginjo with elevated aromatic.
    // Agave doesn't transfer; bright-spicy-aromatic shape does.
    { source: 'cross_beverage_map', descriptor: 'agave-bright',     beverage: 'spirit', f1: 0.65, f2: 0.40, f3: 0.30, f4: 0.30, f5: 0.75, f6: 0.70 },

    // agave-oaked — single research row (Tequila Reposado). Brief-oak vanilla-
    // cedar softening → cedar-aged taruzake cluster.
    { source: 'cross_beverage_map', descriptor: 'agave-oaked',      beverage: 'spirit', f1: 0.40, f2: 0.55, f3: 0.50, f4: 0.40, f5: 0.65, f6: 0.40 },

    // agave-aged — single research row (Tequila Añejo). Caramel-vanilla-
    // dried-fruit oxidative → koshu lighter cluster.
    { source: 'cross_beverage_map', descriptor: 'agave-aged',       beverage: 'spirit', f1: 0.35, f2: 0.75, f3: 0.65, f4: 0.30, f5: 0.50, f6: 0.10 },

    // agave-smoky — single research row (Mezcal Joven). Agave-roasting smoke
    // has no direct sake correlate; closest is warmed yamahai's oxidative-
    // savory funk + taruzake's cedar-spice. "Rustic earthy umami", NOT
    // literal smoke. Carries the disclaimer.
    { source: 'cross_beverage_map', descriptor: 'agave-smoky',      beverage: 'spirit', f1: 0.20, f2: 0.75, f3: 0.65, f4: 0.30, f5: 0.65, f6: 0.15 },

    // ----- FORTIFIED (4 descriptors) ----------------------------------------

    // saline-fortified — single research row (Manzanilla Sherry). Coastal-
    // saline character → kimoto Junmai's mineral-saline edge (Akishika
    // cluster). Drier and saltier than Fino (already covered under wine
    // `oxidative`).
    { source: 'cross_beverage_map', descriptor: 'saline-fortified', beverage: 'fortified', f1: 0.20, f2: 0.75, f3: 0.55, f4: 0.40, f5: 0.85, f6: 0.25 },

    // oxidative-intermediate — single research row (Amontillado Sherry).
    // Transition oxidative between Fino freshness and Oloroso depth → mid-
    // aged koshu (3-5y) cluster. Hazelnut + sea-air vector.
    { source: 'cross_beverage_map', descriptor: 'oxidative-intermediate', beverage: 'fortified', f1: 0.25, f2: 0.85, f3: 0.75, f4: 0.25, f5: 0.65, f6: 0.10 },

    // port-tawny — single research row (Tawny Port). Nutty-caramel-dried-fig
    // oxidative sweetness → aged kijoshu cluster. Sake's sake-in-water trick
    // parallels fortification's fermentation-stop.
    { source: 'cross_beverage_map', descriptor: 'port-tawny',       beverage: 'fortified', f1: 0.35, f2: 0.85, f3: 0.75, f4: 0.20, f5: 0.20, f6: 0.05 },

    // port-ruby — single research row (Ruby Port). Young-jammy-sweet → sweet
    // nigori Genshu cluster. Both undiluted, sweet, lush.
    { source: 'cross_beverage_map', descriptor: 'port-ruby',        beverage: 'fortified', f1: 0.45, f2: 0.70, f3: 0.65, f4: 0.25, f5: 0.10, f6: 0.15 },

    // ----- CIDER (2 descriptors) --------------------------------------------

    // apple-dry-cider — single research row (Dry English Cider). Apple-pear-
    // mineral crisp → Junmai Ginjo apple-pear ester + crisp finish.
    { source: 'cross_beverage_map', descriptor: 'apple-dry',        beverage: 'cider',  f1: 0.55, f2: 0.40, f3: 0.30, f4: 0.45, f5: 0.75, f6: 0.80 },

    // apple-sweet-cider — single research row (Sweet / Pommeau Cider).
    // Apple-brandy-and-juice sweetness → umeshu's plum-and-spirit sweetness.
    // Both spirit+fruit+sugar liqueur-style.
    { source: 'cross_beverage_map', descriptor: 'apple-sweet',      beverage: 'cider',  f1: 0.55, f2: 0.55, f3: 0.45, f4: 0.25, f5: 0.20, f6: 0.30 },
  ] as const

/**
 * The cross-beverage map data, with every row parsed at module load through
 * `CrossBeverageMapSchema`. A bad row (out-of-range f-axis, wrong source,
 * unknown beverage, empty descriptor) throws at import time, not at first use.
 */
export const CROSS_BEVERAGE_MAP: readonly CrossBeverageMap[] = Object.freeze(
  RAW_ROWS.map((row) => parseCrossBeverageMap(row)),
)
