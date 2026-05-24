# ADR-0008: EN-first public launch; DE deferred behind Impressum

## Status

Decided — 2026-05-24

## Context

Germany's §5 TMG (now §5 DDG since May 2024) requires every "geschäftsmäßig" (business-like, systematically-offered) Telemedien service reachable in Germany to publish an Impressum containing a real name and physical postal address. The maintainer will not disclose a personal home address publicly.

Realistic options to satisfy the requirement (see also the conversation log in PR #13):

1. Use a personal home address — rejected on privacy grounds.
2. Form a legal entity (UG / GmbH) — disproportionate to a pre-launch portfolio project.
3. Subscribe to an Impressum service (€5–15/month: impressum-service.de, Tribee, etc.) — the maintainer's chosen path for the full DACH launch, but not committed yet.
4. Don't target the German market publicly until option 3 is in place.

Option 4 is the lowest-friction path to a publicly-shareable artefact in the near term. The TMG / DDG "targets Germany" test weighs domain, language, currency, geographic content, and other DE-specific code paths. An English-only deployment with no `/de/` product surface lands solidly on the "not targeting Germany" side of that test — even though German users can technically reach the site, the obligation to publish an Impressum is at its weakest.

The product nevertheless ships with full English+German i18n infrastructure from day one (ADR-0007). That infrastructure stays — it costs nothing to keep, and the deferred-launch state is meant to be reversed with a one-line code change once the Impressum is in place.

## Decision

- The English locale (`/en/*`) is publicly launched: full landing, JMStV age gate, future sake/scan/chat routes.
- The German locale (`/de/`) renders a **coming-soon page only**. No product content (flavor data, brand pages, recommendations, label scans, cross-beverage results) renders in `/de/*` until the DACH launch.
- The locale switcher stays visible on both surfaces, so a DE visitor can opt into the English preview from the coming-soon page.
- The launched-locale set is encoded as a single constant in `src/app/[locale]/page.tsx`:
  ```ts
  const LAUNCHED_LOCALES = new Set(['en'])
  ```
  Flipping DE to live is a one-line edit once the Impressum is in place.
- The JMStV age gate continues to render on every gated `/en/` path. The legal hook (§6(5)) is weaker for an English-only deployment on a non-`.de` domain, but the gate is harmless and earns the project credibility in both audiences.

## Consequences

- **What changes immediately:** `/de/` (and any `/de/*` path that the proxy rewrites for gating) renders the coming-soon page from `messages/de.json#comingSoon`. The DE landing-page copy in `messages/de.json#landing` is preserved for the eventual DACH launch but is not currently rendered.
- **What stays the same:** next-intl routing, locale switcher, Accept-Language detection, NEXT_LOCALE cookie persistence, i18n catalogue parity test, age-gate cookie and proxy logic.
- **Future routes (sake/scan/chat):** when added, they should be guarded by the same `LAUNCHED_LOCALES` check or routed only under `/en/*`. A DE visitor must never reach a sake/scan/chat page until the DACH launch.
- **Domain selection at deploy time:** prefer `.dev` / `.app` / `.com` over `.de` to keep the "not targeting Germany" position strong.
- **The DACH launch becomes one ticket, not many:** subscribe to an Impressum service, write the Impressum copy into `messages/{en,de}.json`, add `de` to `LAUNCHED_LOCALES`, ship.
- **Disclosure framing:** this is not a legal opinion. The maintainer should confirm with a German IT lawyer (~€100–150 flat fee) before the DACH launch.
