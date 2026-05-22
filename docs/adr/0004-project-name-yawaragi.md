# Project name: Yawaragi (replacing "Kanpai")

**Status:** Accepted — 2026-05-22. Review at Stage 2 go-live gate (see `docs/PRE-GO-LIVE.md` §7.6); rename to **Saketrail** only if formal trademark clearance flags a blocking conflict.

The project's working name is **Yawaragi** (和らぎ). It refers to *yawaragi-mizu* (和らぎ水), the water drunk between sake sips to reset the palate and pace consumption — culturally analogous to the app's role as companion and clarifier. The open-source MCP server has a deliberately decoupled name, **`sakenowa-mcp`**, published as `@yawaragi/sakenowa-mcp`, so the OSS asset remains useful to other developers regardless of any future product rebrand.

We renamed away from "Kanpai" because KANPAI London Craft Sake Brewery (Tom & Lucy Wilson, Bermondsey, founded 2016) operates under that name in the European sake community — Europe's first sake taproom, 100+ UK venue partnerships, and an active educational presence. They are precisely the audience the project hopes to engage; sharing a name would create direct confusion in the EU/UK sake scene, trademark risk, and a poor first impression with potential allies. The word "kanpai" is also generic ("cheers") and globally saturated, making SEO essentially impossible.

## Considered Options

Eight candidates were evaluated in `docs/NAMING-RESEARCH.md`. The top three:

- **Yawaragi (和らぎ)** — chosen. Pronounceable for EN/DE speakers, mission-aligned metaphor, no dominant brand owner, distinctive enough to trademark in software classes.
- **Saketrail** — strong English-compound backup. Instantly comprehensible globally, no brand collisions, but weakly trademarkable and culturally thin.
- **Kanpai Companion** — rejected. "Kanpai" remains the first word users read; would not disambiguate from Kanpai London.

Several Japanese terms were eliminated for cultural-sensitivity reasons: **Kikisake** (a certified-sommelier rank), **Toji** (master-brewer title), **Sakedo** (a Kamakura-era discipline relaunched by the Sake World Association), and **Sakeology** (a formal academic discipline at Niigata University). Using a title or rank as a Western brand name would be equivalent to a non-Italian app calling itself "Sommelier".

## Consequences

The repository, package manifest, README, CLAUDE.md, CONTEXT.md, and documentation have been updated. The follow-ups split into two timed buckets.

### This week — defensive, minimal spend (~€20, ~90 min)

A deliberately stripped-down claim-the-essentials pass. We are *not* defending every TLD or social platform — only the ones that matter for the OSS asset and a public technical presence.

- Register **`yawaragi.dev`** at Cloudflare or Porkbun (~€12–15/yr).
- Create the **`@yawaragi`** npm scope and publish **`@yawaragi/sakenowa-mcp`** as a minimal attribution-only stub.
- Create the **`yawaragi`** GitHub organisation. Move the project repo and the (future) `sakenowa-mcp` repo under it.
- Claim **`@yawaragi`** on X and/or Bluesky (one is enough; pick whichever the target community is more active on).
- Adopt the dual-licence plan (MIT for the MCP server, CC BY-NC-SA 4.0 for the cross-beverage map) — see `docs/LICENSING.md`.

### Defer to Stage 2 go-live decision (~€900–1,400 + ~3–4 hours)

These earn their cost only if the project clears the Phase 7.5 community gate (see `docs/PRE-GO-LIVE.md` §7.6) and commits to a public launch. Until then they are wasted spend.

**Legal / branding (~€900–1,400)**

- [ ] File an **EUIPO trademark application** in Class 9 (software) + Class 41 (education services). ~€900 for both classes at standard EUIPO fees.
- [ ] Run **formal trademark clearance** via an IP lawyer or [Markify](https://markify.com) — EUIPO TMview, USPTO TESS, JPO J-PlatPat searches in both classes for "Yawaragi" and any close variants.
- [ ] Reserve **`yawaragi.app`** and **`yawaragi.com`** if still available. Skip `.io` unless it's clearly in danger.
- [ ] Claim additional social handles (Instagram, Mastodon, Threads, LinkedIn) as the target audience analysis demands.
- [ ] Draft a **migration plan** for a forced rename to **Saketrail** (or another fall-back) in case clearance flags a blocking conflict. Plan covers: env vars, npm scope, GitHub repo, domains, social handles, all docs, all in-product copy.

**Upstream / data permissions (free, async, 3–4 weeks lead time)**

- [ ] Email Sakenowa requesting **written confirmation that `sakenowa-mcp` is acceptable as the npm package name** under their attribution licence. If declined, fall back to `yawaragi-sake-mcp` with Sakenowa attribution in the README.
- [ ] Email Sakenowa to **confirm the f1–f6 → Japanese-label mapping** (see the unverified-mapping note in `CONTEXT.md` flagged ambiguities). No public product copy uses the romaji/kanji labels until this is confirmed in writing.

**Repo / hosting migration (free, ~30 min)**

- [ ] Once the **`yawaragi`** GitHub org exists, transfer `BVengerov/kanpai` (or its renamed form) into it. Update `docs/agents/issue-tracker.md` and the `BVengerov/yawaragi` placeholder in `CLAUDE.md` afterwards.
- [ ] Move the local working directory `~/Projects/kanpai/` → `~/Projects/yawaragi/` and run `git remote set-url origin git@github.com:yawaragi/<repo>.git`.

### Historical-name policy

The historical name "Kanpai" survives in three places by deliberate exception, called out as historical context: this ADR, `docs/NAMING-RESEARCH.md`, and the "Naming" section of `CONTEXT.md`. The Anti-patterns list in `CLAUDE.md` explicitly forbids reintroducing "Kanpai" anywhere else.
