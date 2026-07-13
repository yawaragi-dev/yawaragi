# Barcode Scanning for Sake Identification in Yawaragi: Feasibility & Recommendation

> Research artifact (uploaded 2026-07-09). The project decision derived from it
> is recorded in [ADR-0018](../adr/0018-barcode-scanning-decomposition.md); the
> deferred client-scanner work is tracked in issue #214, and the curated
> JAN/EAN data rider lands with issue #203.

## TL;DR
- **No — barcode lookup would not "always work" for sake, and it fails in exactly the situations Yawaragi's EU-first users hit most.** The barcode number itself scans reliably on the vast majority of Japanese domestic bottles (JAN on the back label is effectively universal for supermarket/liquor-store distribution), but *resolving that number to a product record you can trust* is where it breaks down: no authoritative sake barcode database exists, coverage is thin for premium/craft/export SKUs, and EU-importer relabeling replaces the Japanese JAN with a new EAN that no Japanese source can resolve.
- **Realistic hit rate for EU-purchased sake is low — an estimated 20–45%** depending on the SKU mix, versus label-photo scanning which always extracts *something* usable. Barcode should therefore be a **secondary disambiguation aid, not a primary identifier**, plus a curation tool where the developer records JAN/EAN codes for the EU/US SKUs he catalogs.
- **The technical build is cheap and low-risk** (Yahoo! Shopping Japan's API has a dedicated `jan_code` parameter and is free; scanning works client-side with a WASM/ZXing fallback because iOS Safari's BarcodeDetector is broken), but the *data* problem is the constraint, not the scanning.

## Key Findings

1. **Barcode presence is high in Japan, but not universal, and export relabeling breaks the chain.** JAN codes (EAN-13 compatible, GS1 Japan prefixes 45/49) are standard on the back label of commercially distributed Japanese sake. Small kura selling direct, brewery-shop-only bottlings, limited/seasonal releases (nama, shiboritate), and restaurant-only allocations may carry no retail barcode or a code never registered in any queryable database. On export, an EU importer frequently applies its own relabel — EU law requires an EU importer name/address on the label — and may assign a new EU EAN, meaning the bottle a German user scans often carries a barcode unknown to every Japanese database.

2. **There is no authoritative, sake-specific barcode-to-product database.** The candidate sources each fall short for Yawaragi's "authoritative, no-UGC" bar:
   - **GS1 (Verified by GS1 / GS1 Japan JICFS):** GS1's registries return company/licensee ownership plus, for a subset of products, only a core set of seven foundational attributes (per GS1 US's November 5, 2019 announcement: GTIN, brand name, product description, product image URL, global product category, net content and unit of measure, and country of sale). This is not sake specs, and GS1 Japan's product database (JICFS/IFDB) is not open to a hobby developer — it is restricted to retailers, wholesalers, and manufacturers, or paid data providers.
   - **Open Food Facts:** crowdsourced (fails the no-UGC-as-truth test as product truth) and extremely sparse for sake — its entire Japan instance holds only tens of thousands of products and a very small alcoholic-beverages set.
   - **Rakuten Ichiba Item Search API:** has **no JAN field**; JAN lookup only works by pasting the number into the free-text `keyword`, which hits only when a shop happened to include the JAN in the listing text.
   - **Yahoo! Shopping Japan API:** the standout — a dedicated `jan_code` request parameter that returns product name/price for registered JANs. Best available Japanese JAN resolver, but coverage still depends on sellers having registered the JAN, and returns a commerce listing string, not structured sake specs.
   - **Commercial barcode APIs (UPCitemdb, Barcode Lookup, Go-UPC, etc.):** global and cheap/free at low volume, but weak on Japanese premium sake, return marketing strings, and carry redistribution/caching restrictions.

3. **The barcode only ever gives you a name string — and Yawaragi still has to match that to Sakenowa by name.** Because Sakenowa has no barcode field, a resolved barcode does not directly key into your dataset; you would take the returned product-name string and run the same name-matching you already do after a label photo. So barcode's theoretical advantage (exact identity) is largely lost in translation.

4. **Client-side scanning is technically easy but iOS is a trap.** The native `BarcodeDetector` API works on Chrome/Android but is unimplemented (and broken behind a flag) on iOS Safari/WebKit, so a JS/WASM fallback (ZXing-js via html5-qrcode, or zbar-wasm) is mandatory for a web app. EAN-13 decoding on curved, glossy, reflective bottle glass is materially harder than on flat packaging; a photo-upload/still-image decode fallback is viable and worth adding.

5. **No major sake or wine app relies on barcode lookup — they scan labels.** Vivino uses image recognition (Vuforia computer-vision + Cloud Recognition, plus an ABBYY FineReader OCR system for its wine-list scanner). Sakenomy and sakefan World use label-photo recognition. This validates Yawaragi's existing label-first approach and suggests barcode-primary is an unproven bet for this category.

## Details

### 1. Do sake bottles reliably carry barcodes?

**Japanese domestic bottles.** JAN (Japanese Article Number) is Japan's implementation of EAN-13, governed by GS1 Japan, using country/GS1 prefixes 45 and 49. JAN-13/EAN-13 is the standard retail code, and the back label of a sake bottle "often includes a product barcode (JAN code)… facilitating inventory management and sales tracking." For sake sold through supermarkets, convenience stores, and liquor stores, a scannable JAN is effectively universal because POS systems require it. GS1 Japan reports ~150,000 licensed GS1 Company Prefixes, reflecting broad national adoption.

**The gaps that matter for a sake app:**
- **Small kura / brewery-direct / limited editions.** A brewery selling only at its own shop, at events, or via limited seasonal allocations (nama, shiboritate, hiyaoroshi) has no POS-driven need for a registered JAN, and even where a barcode is printed it may never be entered into any queryable product database. Premium sake is ~25% of production and non-premium (futsushu) ~75%; the well-barcoded futsū-shu is the mass-market bulk, but the premium/craft bottles a Yawaragi enthusiast scans are disproportionately the long-tail SKUs where barcode data is thinnest.
- **Restaurant-only / on-trade bottlings.** Sake is heavily an on-trade (izakaya/restaurant) product; special on-trade bottles and one-off collaborations may lack retail codes entirely.

**Export bottles — the decisive issue for EU-first Yawaragi.** Imported food/drink sold in the EU must carry the name and address of an EU-established importer, and alcohol labeling is tightening. In practice EU/UK importers routinely apply a relabel or an overlay sticker, and commonly assign their **own EAN-13** so the product scans in European retail POS. Three outcomes on an imported bottle:
   1. **Keeps the original Japanese JAN** (common for lightly-handled parallel imports) — resolvable via Japanese sources.
   2. **Carries a new importer EAN** (common for established importer ranges) — **not resolvable via any Japanese database**, and only resolvable if that importer's catalog is queryable (Tippsy/Palate Project, Tengu Sake, etc. do not expose barcode APIs).
   3. **Carries both** (original JAN plus an overlay sticker EAN) — best case, if the user scans the right one.

**Conclusion for Q1:** the *number* is present and scannable most of the time on Japanese-market bottles; but for EU-purchased sake, importer relabeling plus the craft/limited-edition skew of the target audience mean a large minority of scans will yield a code that no authoritative source can resolve.

### 2. Barcode-to-product databases: coverage reality

**GS1 Verified by GS1 (global) and GS1 Japan.** Verified by GS1 almost always returns the *licensee company* behind the prefix; for a subset it returns a core set of seven foundational attributes only. Enough to confirm "this code belongs to Brewery X" but not to populate sake specs. Free access is limited (~30 free searches/day; API access requires membership). Crucially, **GS1 Japan's JICFS/IFDB** — the closest thing to a comprehensive Japanese JAN item database — is **not available to a general web developer** (restricted to retailers/wholesalers/manufacturers, or paid "JDP" data providers). Rules JICFS out for a <€15/month hobby project.

**Open Food Facts / Open Products Facts.** OFF is crowdsourced (fails the "no UGC as product truth" rule as a source of truth), and the more decisive problem is coverage: OFF's Japan instance holds ~40,911 products, of which only ~92 are "Alcoholic beverages"; the global "Sake" category is very sparse. It *could* serve as a free runtime lookup index for the small subset it covers, under ODbL — but (a) ODbL is **share-alike**, so merging OFF data into a redistributed Yawaragi dataset could trigger open-data obligations (runtime-only lookup avoids this, but the line needs legal care); (b) OFF asks that 1 API call = 1 real user scan and that results be cached.

**Rakuten Ichiba Item Search API.** The API's search inputs are `keyword`, `genreId`, `itemCode` (Rakuten's internal shop code, not a JAN), `shopCode`, etc. **There is no dedicated JAN/barcode parameter.** JAN lookup is only possible by placing the number in the free-text `keyword` — unreliable. Rakuten remains excellent for *name/keyword* search and current EU-relevant pricing/affiliate links, just not for barcode resolution.

**Yahoo! Shopping Japan API — the best JAN resolver available to this project.** The itemSearch v3 API has a **dedicated `jan_code` request parameter** and returns a `janCode` response field; rate-limited to 1 query/second, free with a registered Client ID. Coverage caveat: only returns results for JANs that Yahoo Shopping sellers have registered, and returns a commerce listing string rather than structured sake specs — but for Japanese-market JANs it is the most practical, ToS-clean, no-UGC option.

**Commercial barcode APIs.** UPCitemdb, Barcode Lookup, Go-UPC, Barcode Spider resolve EAN/JAN/UPC globally and cheaply (UPCitemdb FREE: 100 combined requests/day). Weaknesses: (a) coverage of Japanese premium/craft sake is weak and returns generic marketing strings; (b) redistribution/caching is restricted. Usable as a last-resort fallback lookup, not as a data spine.

**EU-side importer codes.** No open EAN database resolves EU-importer-assigned codes to sake specs. Importer catalogs (Tengu Sake UK, Tippsy US) are the real "truth" for relabeled SKUs but expose no barcode API — resolution there would require the developer to record the codes manually.

### 3. Technical implementation in a Next.js web app

- **Browser scanning.** The native `BarcodeDetector` (Shape Detection API) works well on Chrome/Android but is **not implemented in iOS Safari**, and even the iOS 17 feature-flag path has been **broken since iOS 18** (open WebKit bug #281848). Since Yawaragi is a web app and iOS Safari is unavoidable for EU users, a **JavaScript/WASM fallback is mandatory**: `html5-qrcode` (wraps ZXing-js) is fastest to integrate; `zbar-wasm` gives better iOS performance. A capability check (`"BarcodeDetector" in window`) selecting native-on-Android / WASM-on-iOS is the standard pattern.
- **Reliability on bottles.** EAN-13 on curved, reflective, film-wrapped sake bottles is meaningfully harder than flat packaging. Mitigations: torch toggle, generous/auto-sizing scan box, and a **photo-upload / still-image decode fallback** for when live scanning fails.
- **Effort.** Adding a scan button + WASM fallback + a lookup call to an existing Next.js app is a small, well-bounded feature — a few days, not weeks — and recurring cost stays within <€15/month (Yahoo/Rakuten free, OFF free, commercial API free tier).

### 4. Strategy synthesis

Evaluating the four options:
- **(a) Barcode as primary identifier with label fallback — reject.** The failure UX is the killer: a barcode that resolves to nothing is a dead end, whereas a label photo always extracts *something* the Claude-vision pipeline can act on.
- **(b) Barcode as a disambiguation aid after label scan — adopt (secondary).** When the label scan yields ambiguous candidates, an optional "scan the barcode to confirm" step can break ties for the subset of bottles with resolvable codes. Low risk, additive.
- **(c) Barcode lookup for the curated delta database — adopt (highest value).** As the developer curates EU/US-available SKUs, recording each SKU's JAN *and* importer EAN turns barcode scanning into a near-100%-reliable lookup **for the curated set**, entirely under his control, no UGC, no third-party coverage dependency. This is the one place barcode is authoritative and delightful.
- **(d) Skip entirely — reasonable minimalist fallback,** but leaves a cheap disambiguation win on the table.

**Recommended posture: (c) as the backbone + (b) as the interaction + label-photo remains primary.**

## Recommendations

1. **Keep label-photo scanning as the primary identifier.** It is the only method that degrades gracefully and the only one that handles importer-relabeled and uncoded bottles.
2. **Ship barcode as an optional secondary path in two roles:** (i) a "scan barcode to confirm/disambiguate" button after a label scan returns multiple candidates; (ii) a direct barcode entry that short-circuits to an exact match **when the code is in the curated delta table.**
3. **Build the curated JAN/EAN table as part of normal curation.** For every EU/US SKU catalogued, record its Japanese JAN and any EU/UK importer EAN, mapping both to the Sakenowa brand ID. This is where barcode becomes authoritative and needs no third-party coverage.
4. **Lookup order for uncatalogued codes:** Yahoo! Shopping `jan_code` → a commercial barcode API free tier (last-resort) → optionally Open Food Facts as a runtime-only lookup (do **not** merge OFF data into a published dataset). Treat all as returning a *name string* that feeds existing name-matching against Sakenowa.
5. **Implement scanning with a capability-based fallback:** native `BarcodeDetector` on Android/Chrome, `zbar-wasm`/`html5-qrcode` on iOS Safari; add a torch toggle and a photo-upload still-decode fallback.
6. **Design the empty-result UX explicitly:** when a barcode resolves to nothing, immediately route to label-photo scanning rather than showing a dead end.

**Benchmarks that would change this advice:**
- If instrumented data shows **barcode resolves >70% of real user scans**, promote it from disambiguation to a co-primary entry point.
- If a **queryable authoritative sake barcode source emerges** (GS1 Japan opening JICFS/GJDB affordably, or an importer publishing a barcode API), revisit barcode-primary.
- If **iOS Safari restores `BarcodeDetector`**, drop the WASM fallback to reduce bundle size.
- If curation scales such that the **delta table covers most user scans**, barcode-first-for-known-SKUs becomes worthwhile as the fast path.

## Caveats
- **Exact sake coverage counts could not be fully verified** (OFF global "Sake" category count unretrievable via automated fetch; Rakuten's 日本酒 genre count unpublished).
- **Hit-rate estimates (20–45% for EU-purchased sake) are reasoned estimates, not measured** — real numbers require instrumenting the feature in production.
- **GS1 access terms can change**, and GS1 Japan's JICFS→GJDB migration is ongoing.
- **ODbL share-alike risk is a flagged legal consideration, not settled advice** — using OFF purely as a runtime lookup differs materially from redistributing merged data; confirm before shipping if OFF is used.
- **Barcode-to-Sakenowa matching remains name-based** because Sakenowa has no barcode field, so barcode does not eliminate the fuzzy-matching step it might appear to.
