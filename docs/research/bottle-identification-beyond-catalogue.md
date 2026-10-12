# Identifying bottles the catalogue lacks: is it worth it?

Research done on 2026-10-12 by a research agent, on the maintainer's question: the bottles a scan cannot find exist, are sold, and are on somebody's web page — so can we find them automatically, and is it worth the money?

Read this as a first survey, not a decision. "Checked" means the page was fetched that day; anything else is marked. The numbers have not been re-verified since. Section 8 lists what was not checked.

Context: the catalogue is a mirror of the Sakenowa Data API, which knows brands (lines) and breweries, not individual bottlings, and lacks some sakes outright. On the 27-bottle scan eval (`evals/label-scan-jp/`), 2 bottles are not in it at all and several are sub-lines it does not list separately.

## 1. Verdict

Yes, it is worth it, and most of it costs almost nothing. Both example bottles are findable with full facts on a public page: Nohime no Sato Kakushi Ginjo on Ginza Berlin's shop, Hokushika Yuki on the brewery's own site. The first thing to build is a small importer index, not barcode databases or web search. The importer's back label already carries a key (Ueno's article code, or the JAN), and the importers' shops expose that key in structured data. A slug match of the 27 test bottles against four importer catalogues found the exact product for 18, the line only for 4, and nothing for 5. Generic barcode databases were close to useless (1 hit in 15 lookups). Web search plus an LLM works as a fallback for the remainder at roughly $0.03–0.15 per bottle, paid once and cached.

Two things need a decision before building:

- **ADR-0016's "never bulk-copy any single proprietary catalog" rule.** A scheduled crawl of a whole importer catalogue conflicts with it on its face. Either ask the importers for permission, or fetch a page only when a scan reads that importer's code.
- **A provenance value for importer and brewery facts.** None of the current `source` values fits a fact parsed from an importer's page without human review.

## 2. Options

| Option | What it resolves | DACH coverage (confidence) | Cost | Legal / terms risk | Effort |
|---|---|---|---|---|---|
| **A. Importer index** (Ueno, Ginza Berlin, Midorinoshima, Sake Kontor), keyed by article code, JAN and name | Exact product, grade, polishing, ABV, size, product URL; JAN where published | About 65–80% of specialist-shop bottles. Medium-low confidence: 18/27 exact on our set, but those bottles were bought from these same importers. | $0 per lookup. A few hundred page fetches a month. | Medium. EU database right and ADR-0016's rule. Ginza's robots.txt says product pages are crawlable; Ueno's is `Allow: /`. Permission by email removes most of the risk. | M |
| **B. On-demand importer lookup at scan time** (read the code, fetch that one page, cache) | Same as A, only for bottles actually scanned | Same as A for Ueno bottles; needs the code to be read | $0, plus one HTTP fetch | Low. One page per scan, not a bulk copy. | S |
| **C. Brewery site** | Official Japanese name, JAN, SMV, acidity, polishing, ABV | High for mid-size breweries, per bottle. Not automatable in general: every site is different. | $0 if hand-picked; otherwise it is option D | Low (facts from the maker) | L if generic, S per brewery |
| **D. Web search + LLM at scan time, cached** | Anything with a web page | Likely 80%+ of the remainder. Not measured. | About $0.03–0.04 per lookup on Haiku 5.5, $0.10–0.15 on Sonnet 5.5 (an estimate: 2–3 searches, about 40k input tokens) | Low-medium. Output is LLM-extracted, so it needs the badge and a source URL. Brave forbids storing results without a storage-rights plan. | M |
| **E. Yahoo! Shopping JP `jan_code` API** | JAN to a Japanese listing title | 20–45% per `barcode-scanning-feasibility.md`. Not tested: needs an app ID. | Free per that research | Terms not checked (docs page returned 403) | S |
| **F. Free barcode databases** (Open Food Facts, UPCitemdb, JANCODE DATABASE) | JAN to a name string | About 0–10% (1 hit in 15 lookups; high confidence it is poor) | Free tiers | jancode.xyz forbids tool access outright | S, not worth it |
| **G. Rakuten Ichiba API** | Name search only | Not a barcode resolver | Not stated on the docs page | Terms page not read | S |
| **H. Other sake databases** | See section 6 | — | — | SAKETIME's terms forbid copying and storing | — |

**On the DPA rule:** a barcode, an article code or a product name sent from our server is not personal data, and the visitor's IP never reaches the vendor. The agent's reading is that no DPA is needed on personal-data grounds, as long as the photo itself is never sent. ADR-0016 already takes this reading for Rakuten. Issue #214 says the opposite ("each is a new non-EU vendor → DPA + SCCs"); the two should be reconciled.

## 3. The two example bottles

**Nohime no Sato Kakushi Ginjo, 180 ml — found, via the importer.**

- Page: https://ginza-berlin.com/products/nohime-no-sato-kakushi-ginjo-sake-180ml
- The page's schema.org Product data gives SKU `KZ03010200`, brand "Kiyosuzakura Brewery" and `gtin13: 4972212072082`.
- The description gives polishing 60%, Aichi, bottled 12/2024; the shop tags it Ginjo.
- The same product exists in 720 and 300 ml (`KZ03010100`, `KZ03010300`).
- The brewery's site is https://onikoroshi.co.jp/. Its news posts name 濃姫の里 隠し吟醸 (award posts from 2020 and 2021). Its product page was not opened, so the specs there are unverified.
- SAKETIME also lists it with reviews.

**Hokushika "Yuki" honjozo namachozo, 300 ml — found, via the brewery.**

- Page: https://www.hokushika.jp/products/279, titled 雪 生貯蔵（本醸造）.
- Facts on the page: 300 ml, JAN 4955596367043, 413 yen, SMV +7.0, ABV 15, acidity 1.2, polishing 70%, ingredients rice, koji and brewer's alcohol.
- The site is WordPress with an open REST endpoint: `/wp-json/wp/v2/products` lists all 31 products.
- Web search did not find this page. Two searches came back with Hokusetsu and Hakushika instead, so a search-based resolver would need the brewery's domain as a hint.
- No website was found for Japan Food Express GmbH (unverified whether one exists).
- A hellosake.com listing ("Namachozoushu Honjouzou Yuki", 70%, acidity 1.2) appeared in a search snippet only.

## 4. Live barcode lookups

| JAN | Open Food Facts | UPCitemdb (trial) | JANCODE DATABASE (jancode.xyz) |
|---|---|---|---|
| 4900664715042 | not found | 0 items | not registered |
| 4972009002766 | not found | 0 items | **出羽桜 純米大吟醸 雪女神 四割八分 720ml, 出羽桜酒造** |
| 4532411001087 | not found | 0 items | not registered |
| 4955596367043 (Hokushika Yuki) | not found | 0 items | not registered |
| 4972212072082 (Nohime 180 ml) | not found | 0 items | not registered |

- A plain web search for each of the first three numbers returned nothing relevant.
- Yahoo! Shopping's and Rakuten's public search pages returned blocked or empty responses to curl; their APIs need keys and were not tested.
- jancode.xyz states on its pages that tool access and direct URL entry are grounds for blocking. About seven requests were made before that was read; it must not be used in the product.
- Useful side finding: imported bottles keep the Japanese JAN at least sometimes. Ginza publishes the brewery's own JAN as `gtin13` (3 of 10 sampled pages carried one).

## 5. What the importer sites offer (all checked)

- **Ueno Gourmet** (de.japan-gourmet.com), Shopware 6:
  - Its sitemap has 413 URLs, and the shop states 140 sake products.
  - The label's article code is the shop's SKU. `https://de.japan-gourmet.com/search?search=SF04-03` returns exactly one product, Fukuju Awasaki Sparkling.
  - Product pages carry microdata (`sku`, brand, price) plus ABV and prefecture; no JAN.
  - `robots.txt` is `Allow: /`. A keyword scan of the terms found no clause on automated access; they were not read in full.
- **Ginza Berlin**, Shopify:
  - `/products.json` returns the whole catalogue, 215 products, roughly 35 of them sake by title or tag.
  - Product pages carry JSON-LD with `sku` and sometimes `gtin13`.
  - robots.txt says public product pages are crawlable and points to an agent catalogue endpoint.
- **Midorinoshima**: sitemap with 910 product URLs, 488 with "sake" in the slug. JSON-LD Product with a code-like SKU ("C4-02 (603)"); no JAN.
- **Sake Kontor**: sitemap with 177 products, tableware included. JSON-LD Product; no JAN.
- **JFC** (jfc.eu): 48 pages, no public product catalogue. It is a wholesaler.

## 6. Web search prices and other databases

**Per-lookup prices, from the vendors' pages on 2026-10-12:**

- **Anthropic web search tool**: $10 per 1,000 searches plus tokens; web fetch has no extra charge. The same page lists Haiku 5.5 at $0.10 / $0.50 and Sonnet 5.5 at $2 / $10 per million tokens. https://platform.claude.com/docs/en/about-claude/pricing
- **Brave Search API**: $5 per 1,000 requests, with $5 of free credit a month. Its FAQ says storing results needs a plan that grants storage rights; the price of that plan was not confirmed. https://brave.com/search/api/
- **Tavily**: 1,000 free credits a month, then $0.008 per credit; a basic search is 1 credit. https://docs.tavily.com/documentation/api-credits
- **Exa**: $7 per 1,000 searches ($4 for "instant"), contents $1 per 1,000 pages, $10 of free credit a month. https://exa.ai/pricing
- **SerpApi**: 250 free searches a month, then $25 for 1,000. https://serpapi.com/pricing
- **Google Custom Search JSON API**: closed to new customers; existing ones have until 1 January 2027. https://developers.google.com/custom-search/v1/overview

At 5 scans a day per visitor and a one-time cache per bottle, even the Sonnet price is bounded by the number of distinct unknown bottles, not by traffic. Latency was not measured; expect several seconds, so it should run after the scan result is shown.

**Other databases:**

- **Rakuten Ichiba Item Search**: no JAN parameter; now needs an application ID and an access key. https://webservice.rakuten.co.jp/documentation/ichiba-item-search
- **SAKETIME**: has product-level pages and reviews, but no API is mentioned, and Article 6 of its terms forbids copying, redistributing, or storing its information for that purpose. https://www.saketime.jp/terms/
- **Wikidata**: 6 items typed as sake. Useless.

## 7. Recommended sequence

1. **Read the importer and its code off the back label, and build the Ueno + Ginza index.**
   - Cost: 2–4 days of work, $0 running.
   - Email both importers first, offering a link back to the product page.
   - Measure: of the 27 bottles, how many resolve to an exact product page. The baseline from the slug match is 18 exact, 4 line-only, 5 none. Target 20 or more, with zero wrong products.
   - This is issue #203's table; the JAN column also unlocks #342 for free.
2. **Add Midorinoshima and Sake Kontor, plus hand-picked brewery pages for the misses.**
   - Cost: 1–2 days.
   - Measure: the five misses (Hokushika Yuki, Ikekame Kurokabuto, Sekinoichi, Choryo, Fudoh) and the four line-only bottles.
3. **Web-search fallback behind a flag, only if a meaningful gap remains after step 2.**
   - Cost: under $5 to run the whole set several times on both models.
   - Measure: correct product page and correct grade, polishing and ABV per bottle; cost and seconds per lookup; how often it returns a wrong brewery (the Hokushika/Hokusetsu confusion above is the risk).

## 8. Not verified

- Yahoo! Shopping's `jan_code` API: coverage, rate limit and terms. The 20–45% figure is from `barcode-scanning-feasibility.md`.
- Rakuten's terms on storing and showing data.
- Which bottle 4900664715042 and 4532411001087 belong to.
- GS1 Japan / JICFS, go-upc, barcodelookup.com, EAN-Search, Sakenomy, Tippsy, True Sake, the Japan Sake and Shochu Makers Association and the National Tax Agency list. Not checked; ADR-0016 records that none offers an open product API.
- The 18/27 figure is a URL-slug match, not a page-by-page confirmation. The four "line-only" bottles are Garyubai, Sawa no Hana, Zuiyo and Shirakawago.
- The full terms of Ueno, Midorinoshima and Sake Kontor; the price of Brave's storage-rights plan; search latency.
- Whether importers generally keep the Japanese JAN or print their own. It was seen kept in a handful of cases only.
