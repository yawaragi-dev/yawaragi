# ADR-0004: Project naming and the Kanpai London collision

## Status
Decided — 2026-05-22

## Context
The working name "Kanpai" collided with KANPAI London Craft Sake Brewery
(Tom & Lucy Wilson, Bermondsey, est. 2016) — a well-known node in the
European sake community that this project specifically wants to engage.
The word "kanpai" itself is also generic ("cheers") and saturated globally.

Naming research (see `docs/NAMING-RESEARCH.md`) evaluated ~15
candidates against pronounceability, memorability, mission alignment,
cultural respect, SEO, visual appeal, and MCP server naming.

## Decision
Rename the project to **Yawaragi** (和らぎ).

"Yawaragi-mizu" (和らぎ水) is the water drunk between sips of sake to soften
alcohol's impact and reset the palate. The metaphor matches the product
mission exactly: the app accompanies and clarifies sake, it doesn't replace
the drinker's relationship with it.

The MCP server is published separately under `@yawaragi/sakenowa-mcp` —
the package name signals its data source (Sakenowa) rather than the
consumer brand, which is the convention in the MCP ecosystem and respects
the upstream attribution requirement.

## Considered alternatives
- **Kanpai Companion** — rejected; "Kanpai" remains the first word users
  see, search, and remember.
- **Saketrail** — kept as backup if a Yawaragi trademark conflict surfaces.
- **Fukumi-ka, Kira, Hanayaka, Tsunagu, Shirube, Sakemap, Sakenote,
  Sakeology, Sakedo, Kikisake** — all rejected; reasons documented in
  the naming research file.

## Consequences

### Naming asset registrations (actual outcome)

Registered or claimed:
- Domain: `yawaragi.dev` (**Porkbun**, personal registration, WHOIS privacy)
- npm scope: `@yawaragi`
- npm package: `@yawaragi/sakenowa-mcp@0.0.1` (placeholder stub, MIT licensed)
- GitHub org: `yawaragi-dev`
- GitHub repo (MCP server): `yawaragi-dev/sakenowa-mcp`
- GitHub repo (main app): `yawaragi-dev/yawaragi` (transferred from `BVengerov/kanpai` and renamed)
- Bluesky: `@yawaragi.dev` (via custom-domain verification)
- X: *pending — deferred from this-week list; will claim when audience demands it (Stage 2)*

Pattern notes:
- The bare "yawaragi" namespace was blocked on both GitHub and Bluesky
  by dormant accounts. The "yawaragi-dev" suffix preserves brand
  consistency with the domain and reads as the canonical project home.
- The npm scope (`@yawaragi`) is independent of the GitHub org and stays
  bare — npm scopes are the user-facing identifier developers type.
- The Bluesky handle uses domain-verification (`@yawaragi.dev`) which is
  stronger than a `*.bsky.social` handle would have been.

### Build-plan files updated

All build-plan files (CLAUDE.md, CONTEXT.md, README, package.json,
LICENSE, LICENSE-STRATEGY) updated from "Kanpai" to "Yawaragi" in this PR.

## Cost
- ~€15 (domain registration, first year).
- ~90 minutes setup.
- Deferred: EUIPO trademark filing (~€900), formal trademark clearance
  (~€200-500). Deferred until Stage 2 go-live commitment.

## Review trigger — Stage 2 gate
This decision is revisited at the Stage 2 conditional go-live decision
point (per `docs/PRE-GO-LIVE.md` §7.6). At that point:

1. Run formal trademark clearance: EUIPO TMview, USPTO TESS,
   JPO J-PlatPat for "Yawaragi" in Nice Class 9 (software) and Class 41
   (education services).
2. If clearance is clean, file EUIPO application (€850 + €50 = €900).
3. If clearance reveals a conflict, fall back to "Saketrail" and migrate:
   - Re-register domain
   - Rename GitHub org (creates redirects but breaks API consumers)
   - Republish MCP under `@saketrail/sakenowa-mcp`, deprecate the old
     package with a notice pointing to the new one
   - Update Bluesky/X handles or claim new ones
   - Communicate the rename in a blog post

The migration cost is meaningful (~4-6 hours of work + community
confusion) but bounded. The expected probability of a Yawaragi software
trademark conflict is low; the value of deferring the €900 spend until
go-live commitment is high.

## Outreach

Both outreach actions are deferred to the following Monday (2026-05-25), three days after the rename.

- **Sakenowa contact**: emailed *YYYY-MM-DD* coordinating on `@yawaragi/sakenowa-mcp`
  package name and attribution. Response: *[pending / received on YYYY-MM-DD]*.
- **Kanpai London (Tom Wilson)**: *[contacted / not contacted on YYYY-MM-DD]*
  with brief intro: "I built a sake companion app, originally working-titled
  Kanpai; renamed to Yawaragi to avoid confusion with your brewery; would
  love to learn from / collaborate with you if open." Turning a potential
  conflict into a relationship is part of the project's "respect the
  community" thesis.
