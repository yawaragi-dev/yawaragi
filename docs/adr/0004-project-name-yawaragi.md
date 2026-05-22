# Project name: Yawaragi (replacing "Kanpai")

The project's working name is **Yawaragi** (和らぎ). It refers to *yawaragi-mizu* (和らぎ水), the water drunk between sake sips to reset the palate and pace consumption — culturally analogous to the app's role as companion and clarifier. The open-source MCP server has a deliberately decoupled name, **`sakenowa-mcp`**, published as `@yawaragi/sakenowa-mcp`, so the OSS asset remains useful to other developers regardless of any future product rebrand.

We renamed away from "Kanpai" because KANPAI London Craft Sake Brewery (Tom & Lucy Wilson, Bermondsey, founded 2016) operates under that name in the European sake community — Europe's first sake taproom, 100+ UK venue partnerships, and an active educational presence. They are precisely the audience the project hopes to engage; sharing a name would create direct confusion in the EU/UK sake scene, trademark risk, and a poor first impression with potential allies. The word "kanpai" is also generic ("cheers") and globally saturated, making SEO essentially impossible.

## Considered Options

Eight candidates were evaluated in `docs/NAMING-RESEARCH.md`. The top three:

- **Yawaragi (和らぎ)** — chosen. Pronounceable for EN/DE speakers, mission-aligned metaphor, no dominant brand owner, distinctive enough to trademark in software classes.
- **Saketrail** — strong English-compound backup. Instantly comprehensible globally, no brand collisions, but weakly trademarkable and culturally thin.
- **Kanpai Companion** — rejected. "Kanpai" remains the first word users read; would not disambiguate from Kanpai London.

Several Japanese terms were eliminated for cultural-sensitivity reasons: **Kikisake** (a certified-sommelier rank), **Toji** (master-brewer title), **Sakedo** (a Kamakura-era discipline relaunched by the Sake World Association), and **Sakeology** (a formal academic discipline at Niigata University). Using a title or rank as a Western brand name would be equivalent to a non-Italian app calling itself "Sommelier".

## Consequences

The repository, package manifest, README, CLAUDE.md, CONTEXT.md, and documentation have been updated. The following follow-ups are **manual** and outside the scope of this ADR's automated changes:

- Rename the GitHub repository `BVengerov/kanpai` → `BVengerov/yawaragi`. Update `docs/agents/issue-tracker.md` afterwards.
- Move the local working directory `~/Projects/kanpai/` → `~/Projects/yawaragi/` and update the git remote.
- Reserve domains: `yawaragi.app`, `yawaragi.io`, `yawaragi.dev`.
- Claim the `@yawaragi` npm scope and create the `yawaragi` GitHub organisation.
- Claim social handles (`@yawaragi` or `@yawaragiapp` on Instagram, X, Mastodon, Bluesky).
- File an EUIPO trademark application in Class 9 (software) and Class 41 (education services) — approx. €900.
- Publish `@yawaragi/sakenowa-mcp` to npm as a minimal attribution-only stub to claim the package name.
- Run formal trademark clearance (EUIPO TMview, USPTO TESS, JPO J-PlatPat) before public launch.

If WHOIS or EUIPO search later reveals an active "Yawaragi" software trademark, the fall-back name is **Saketrail**.

The historical name "Kanpai" survives in three places by deliberate exception, called out as historical context: this ADR, `docs/NAMING-RESEARCH.md`, and the "Naming" section of `CONTEXT.md`. The Anti-patterns list in `CLAUDE.md` explicitly forbids reintroducing "Kanpai" anywhere else.
