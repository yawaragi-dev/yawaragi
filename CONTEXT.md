# Kanpai

A sake companion. Helps users recognise, discover, and track the sake they enjoy through three surfaces: label scan, chat recommender, taste profile.

## Language

**Sake**:
A sake product line (銘柄, *meigara*) produced by a single Brewery — e.g. "Dassai", "Kubota Senju". The unit of recommendation, scanning, and taste-profile vectors. Sakenowa's API calls this `brand`; we deliberately rename to avoid collision with the colloquial English meaning ("the brand" = the company).
_Avoid_: Brand, Label, Meigara, Product

**Brewery**:
The company that produces Sakes (酒蔵, *sakagura*). Matches Sakenowa's `brewery` 1:1.
_Avoid_: Sakagura, Kuramoto, House, Producer

**Prefecture**:
A Japanese administrative region — one of the 47 prefectures (e.g. Niigata, Yamaguchi). Sakenowa calls this `area`; we rename for precision and to reserve "Region" for future broader climate groupings (Tōhoku, Kansai, etc.).
_Avoid_: Area, Region

**FlavorProfile**:
The continuous 6-tuple attached to a Sake, describing its position along the Sakenowa aroma/body/dryness axes. Axes are `floral`, `mellow`, `heavy`, `mild`, `dry`, `light`, each a float in `[0, 1]`. Used for vector similarity ("sake similar to this one") and positioning, **not** for hard filters like "sweet" or "umami". Sakenowa's `flavorChart` (f1..f6) translated.
_Avoid_: FlavorChart, TasteVector, FlavorMap

**FlavorAxis**:
One of the six fixed axes of a FlavorProfile: `floral`, `mellow`, `heavy`, `mild`, `dry`, `light`. Closed enum — never extended.
_Avoid_: f1..f6, flavor dimension, taste axis

**FlavorTag**:
A discrete categorical tag attached to a Sake from Sakenowa's 117-tag vocabulary (e.g. `甘味` sweet, `旨味` umami, `酸味` acidic, `フルーティ` fruity). Used for hard filters and chat-driven queries that the 6-axis FlavorProfile cannot answer. A Sake has zero or more FlavorTags.
_Avoid_: Tag (too generic), FlavorLabel, FlavorAttribute

**TasteProfile**:
A *User*'s aggregated preference, built up from their ratings and interactions. Lives in our own data, not Sakenowa. Mirrors the FlavorProfile shape (6 axes) plus a weighted set of preferred FlavorTags.
_Avoid_: UserProfile (collides with auth), FlavorProfile (that's the Sake's, not the User's), Preference

**Ranking**:
A single Sake's position-and-score within a popularity list, for a specific month. Scope is either *overall* (global top 100) or a single Prefecture (regional top N). A Sake has zero or more Rankings: it may appear in overall, in its Brewery's Prefecture, in both, or in neither. The `year_month` records which monthly snapshot the position came from. We store only the latest snapshot — never historical.
_Avoid_: Rank, Position, PopularityRank

## Relationships

- A **Sake** is produced by exactly one **Brewery**
- A **Brewery** produces zero or more **Sakes**
- A **Brewery** is located in exactly one **Prefecture**
- A **Sake** has exactly one **FlavorProfile**
- A **Sake** has zero or more **FlavorTags**
- A **User** has exactly one **TasteProfile** (derived, not stored as a snapshot)
- A **Sake** has zero or more **Rankings** (at most one *overall*, at most one per its Brewery's Prefecture, both for the current month only)

## Flagged ambiguities

- Sakenowa exposes a sentinel `areaId: 0` named "その他" (Other) for Breweries with no assigned prefecture. We keep it as a Prefecture row to avoid orphaned Breweries, but it is not a real prefecture and should be excluded from any geographic ranking or filter UI.
- **Sweet, umami, and acidic are NOT FlavorAxes.** Sakenowa's 6-axis FlavorProfile measures aroma/body/dryness, not the canonical sommelier dimensions. Sweet ≈ inverse of `dry` *but* has its own discrete FlavorTag (`甘味`, id:12). Umami and acidic live only as FlavorTags (`旨味` id:5, `酸味` id:2). When a user asks for "sweet sake", the recommender must filter by FlavorTag, not by FlavorProfile. When asked for "sake similar to this one," it must use FlavorProfile, not tags.
- **FlavorTag and FlavorAxis overlap semantically.** `辛口` (dry) is both an axis (`dry`/f5) and a tag (id:3). `フルーティ` (fruity) overlaps with `floral` (f1). When both surfaces disagree, prefer the tag for hard filters and the axis for similarity. Never expose the redundancy to users.
- **Same-romaji collisions are possible across Breweries and Sakes.** Two distinct Japanese names (e.g. 旭酒造 / 朝日酒造) may transliterate to the same `name_romaji`. Search must disambiguate using Prefecture, the `name_ja` field, or both. Do not assume `name_romaji` is unique.

## Naming convention

Every entity sourced from Sakenowa that carries a human-readable label (**Sake**, **Brewery**, **Prefecture**, **FlavorTag**) has two name columns:

- **`name_ja`** — the original Japanese (kanji/kana). Source of truth. What label-scan OCR matches against.
- **`name_romaji`** — Latin-alphabet transliteration. What users type in search and what the chat agent speaks. Mixed-case for display.

Prefectures use a static 47-entry lookup. Sake and Brewery transliterations are generated by an LLM at ingest time, **only when the row is new or `name_ja` has changed**. A separate `name_romaji_override` table (keyed by Sakenowa id) wins over LLM output and is hand-curated for popular sakes.
