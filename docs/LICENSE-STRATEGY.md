# Licensing Strategy

This project follows an **open-core** model: the infrastructure is open-source under MIT, the curated knowledge is shared under a Creative Commons license that prevents commercial cloning.

## What's licensed how

| Asset | License | Lives where |
|---|---|---|
| `@yawaragi/sakenowa-mcp` (the MCP server) | MIT | github.com/yawaragi-dev/sakenowa-mcp |
| Cross-beverage bridging table | CC BY-NC-SA 4.0 | This repo, `data/cross-beverage-map.json` |
| Curated glossary (markdown files) | CC BY-SA 4.0 | This repo, `data/glossary/` |
| Application code (Next.js app, UI, server actions) | Proprietary / All Rights Reserved | This repo |
| Zod schemas, type definitions | MIT | This repo, `src/lib/schemas/` |

## Rationale

- **MIT for the MCP server.** Anyone wrapping the public Sakenowa API would write similar code. Shipping the canonical version openly attracts contributors and positions Yawaragi as a good actor in the sake-tech ecosystem.
- **CC BY-NC-SA 4.0 for the cross-beverage map.** This is the project's hardest-to-replicate asset — it requires palate calibration, sake-culture knowledge, and ongoing curation. The NC clause prevents a commercial competitor from lifting it into a paid product. The SA clause means anyone who modifies it must share their version under the same terms.
- **CC BY-SA 4.0 for the glossary.** Educational content benefits from being freely usable (including commercially) as long as it's attributed and shared alike. The glossary is fundamentally a translation/explanation of public sake vocabulary; restricting commercial use would feel ungenerous.
- **MIT for Zod schemas.** Type definitions are a thin layer over the public API contract; no defensive value in restricting them.
- **Proprietary for app code.** Standard. Reviewable on GitHub but not licensed for reuse. If the project goes commercial later, this allows for proprietary features without untangling open-source obligations.

## Files

Each licensed file or directory carries a header comment or a sibling `LICENSE` file naming the applicable license. Top-level `LICENSE` in the main app repo states "All Rights Reserved" with an exception list pointing to the CC-licensed directories.

## Review trigger

This strategy is revisited at the Stage 2 go-live decision point (per `docs/PRE-GO-LIVE.md`). If the project commercialises, the proprietary app code may shift to a commercial dual-license; the open-source pieces stay as documented above.
