# Scan result renders in place; `/scan` is fully age-gated

**Status:** accepted (supersedes the "ungated scan CTA" and "auto-redirect to brand page" decisions in PRD #105 / Issue #106)

## Context

The label-scan flow was built to `router.push('/sake/[brandId]')` on a confident (`auto`-tier) match, and the `/scan` entry route was deliberately left **ungated** so the scan button could act as a pre-age-gate discovery affordance (PRD #105 §"Age-gate interaction", Issue #106). The redirect was load-bearing for JMStV compliance: flavor and brand data only ever rendered on `/sake/[brandId]`, which the proxy gates, so an un-accepted visitor who matched was bounced to the age gate rather than shown flavor data.

The UX redesign (make the scan payoff *rewarding*) requires showing the visitor's own label photo — a client-only object URL that cannot survive a route change — alongside the sake's name, flavor chart, and a reverse cross-beverage suggestion ("interesting for those who like Riesling"). That payoff has to render **in place on `/scan`**, which removes the redirect that was protecting the data.

## Decision

1. **Render the scan result in place.** A confident match swaps the form for a rich result card on `/scan` (photo + name + flavor chart + reverse-beverage hook + a "See full details →" link to `/sake/[brandId]`, which remains the deep-dive permalink). The `auto`-tier `router.push` in `scan-form.tsx` is removed.
2. **Gate the whole `/scan` route** (like `/sake/[brandId]`), rather than gating only the result render. Because the age gate already fires on the landing page on first visit, virtually all real traffic accepts before reaching `/scan`; the only visitor affected is one who deep-links straight to `/scan`. This is simpler than keeping the route ungated while conditionally withholding result data from the DOM, and it preserves the JMStV guarantee that no flavor/recommendation data reaches an un-accepted visitor.

## Consequences

- A modal overlay over already-rendered result data would **not** satisfy the "no flavor data before 18+ acceptance" rule (the data is still in the DOM). Gating the route sidesteps this entirely.
- The in-place card needs the sake's `FlavorProfile`, which the `matched` action state does not currently carry (`lookupFlavorChart` is never called in the scan action). The result path must fetch it.
- **Doc debt cleared in the implementing PR:** PRD #105 §"Age-gate interaction" and the defending comments in `src/app/[locale]/scan/page.tsx` are now stale and must be updated to describe the gated route + in-place result. ADR-0006 (age gate) is unchanged in substance but should cross-reference this ADR.
- The pre-acceptance landing hero (which reuses this result card as a curated example) must likewise render its flavor data only when `gateAccepted` is true.
