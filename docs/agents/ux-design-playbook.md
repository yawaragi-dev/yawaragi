# UX design playbook for Yawaragi

Reference doc for anyone (human or agent) implementing a UI slice on Yawaragi.
Consult it before you write the first line of a new interactive surface, and
consult it again against the pre-flight checklist at the end before you declare
the slice done.

This doc layers on top of `CLAUDE.md`. It does not repeat the age-gate,
Sakenowa attribution, provenance-badge, 6-axis vocabulary, i18n, or GDPR rules
already documented there — instead it names the UX consequences those rules
have when you actually build a surface. If you are unsure whether a rule
applies, `CLAUDE.md` is the source of truth; this doc tells you what the rule
LOOKS LIKE in a component.

## Why this doc exists

Every time a UI slice has landed on Yawaragi with a gap that only manual QA
caught, the gap has been a class of miss, not a one-off bug:

- **#163 (UX-B).** The scan surface auto-navigated to `/sake/[brandId]` on a
  confident match. The visitor's own label photo — the thing that made the
  moment feel like *theirs* — was lost across the route change. The slice met
  its acceptance criteria; the criteria did not encode "does this feel
  rewarding?". Fix required an ADR (`docs/adr/0015`) and a full re-architecture
  of the result path.
- **#184.** Starter chips on `/[locale]/suggest` render as raw next-intl
  anchors. A click triggers a full RSC navigation that spins the LLM tool loop
  for several seconds; nothing on-screen changes until the new page streams
  in. The sibling `<SuggestFreeformForm />` handles the exact same
  navigation correctly (`useTransition` + `Exploring…` label swap), but the
  chip path bypasses it. Live from Phase 4 / S6 (#144, PR #173); no
  self-review caught it.
- The pattern generalises: an implementer treats the acceptance criteria as
  exhaustive when they usually only describe what the human REMEMBERED to
  specify. The taste-level UX layer — 100 ms feedback, dead-end affordances,
  discovery framing on empty states — is almost never in the criteria and
  almost always noticed once it's missing.

Yawaragi ships to DACH users (JMStV constraints, discovery framing) AND is
portfolio evidence for recruiters (snap-judgement UX taste). Both audiences
punish the same misses. This doc's job is to make the un-stated requirements
stateable.

## The three lenses

Every UI slice must clear three lenses simultaneously. When they trade off,
resolve toward compliance (JMStV/GDPR) first, then user, then recruiter — but
in practice they usually align.

### The DACH visitor's discovery journey

The visitor arrived to explore Japanese sake through a Western vocabulary they
already have (`smoky whisky`, `light and floral`) or a bottle in front of
them. Every surface answers "what can I explore next?" without demanding they
already know the answer. If a state has no onward affordance it is a bug.

### The recruiter's snap judgement

Recruiters skim the deployed app for two minutes. They form an opinion from
the first interaction — click a starter chip, upload a photo, load `/scan`.
If that first interaction feels dead (no 100 ms feedback, no acknowledgement),
they leave; the codebase quality is irrelevant. The recruiter's judgement is
made on the same moments the DACH visitor cares about, so building for one
builds for the other.

### The JMStV / GDPR compliance envelope

The age gate must precede any flavor / brand / recommendation data (ADR-0006,
ADR-0015). Copy is discovery-framed, never promotional (CLAUDE.md §"Age gate
and JMStV compliance"). Personal data is opt-in per purpose (ADR-0009). These
are not "compliance polish" to add at the end; a surface that violates them
must not merge.

## Interaction feedback loops (the 100 ms / 1 s / 10 s rule)

Nielsen Norman Group's response-time boundaries — sourced from Miller (1968)
and Card, Robertson & Mackinlay (1991), summarised at
<https://www.nngroup.com/articles/response-times-3-important-limits/> — are
the load-bearing physics for every interactive click on this app:

- **≤ 100 ms** — the visitor feels the system is reacting *to* their action.
  Any UI element that responds to a click MUST render a visible acknowledgement
  in the same frame the click landed. This is a hard constraint, not a
  preference.
- **≤ 1 s** — the visitor's flow of thought stays uninterrupted. Between
  100 ms and 1 s the trigger stays visibly pending (label swap, `aria-busy`,
  disabled cursor); no separate skeleton yet.
- **> 1 s** — the visitor needs a progress signal. Skeleton, streaming
  content, or a loading state that names what is happening. Silence past 1 s
  reads as broken.

Concrete patterns for this stack:

- **A `<button>` that triggers a Server Action** — wrap the call in
  `useTransition`, disable the button on `isPending`, and swap the label to a
  localised pending string. The freeform form does this correctly:
  `src/app/[locale]/suggest/suggest-freeform-form.tsx` reads `suggestPending`
  and shows `Exploring…` while `router.push` is in flight. Copy the shape.
- **A chip / link that navigates via `router.push`** — same as above. A raw
  `<Link>` gives you no feedback hook, so the chip that navigates to a
  loading page is the failure mode #184 caught. Either wrap the chip in a
  client component with `useTransition`, or route it through the same input
  the form owns so the form's own pending state flips (the fix chosen by
  #184).
- **A `<form>` submit** — `useActionState` returns `isPending` for free.
  See `src/components/scan/scan-form.tsx` — `isPending = isDownscaling ||
  isActionPending` covers both the browser-side canvas work AND the
  action's server round-trip; the button reads `t('pending')` throughout.
- **A `<Link>` that does a plain page navigation** — Next.js prefetches on
  hover, but the *click-to-next-paint* still needs a page-level `loading.tsx`
  so the visitor doesn't stare at the previous page for several seconds.
  `src/app/[locale]/suggest/loading.tsx` is the pattern; every route that can
  trigger a slow RSC render needs one.

If a click cannot render feedback in 100 ms because the payload is expensive
(the LLM tool loop, the vision call), the feedback is not "make it faster" —
it is "acknowledge the click *now*, resolve the payload separately". Client
state is cheap; server work is not.

## State visibility

Every visible action has a state. If the visitor can see the element, the
element's current state must be legible:

| State    | Where it shows                                         |
|----------|--------------------------------------------------------|
| idle     | default styling                                        |
| hover    | Tailwind `hover:` — every clickable surface has one    |
| focus    | `focus-visible:ring-*` — WCAG 2.4.7 SC "Focus Visible" |
| active   | Tailwind `active:` for pressed feedback (optional)     |
| pending  | `aria-busy`, disabled trigger, label swap              |
| success  | in-place render of the result, not "OK toast"          |
| error    | see "Discovery framing" — never error tone             |
| disabled | `disabled` attribute AND `aria-disabled`; muted style  |

Rules that bit us:

- **`focus-visible` never `focus`.** A visitor navigating with the mouse
  should not see a ring on every click; a visitor navigating with a keyboard
  MUST see one on every focus. Tailwind's `focus-visible:` handles the
  distinction; do not use bare `focus:`.
- **Pending is a first-class visible state.** #184's chip had no pending
  state at all — the click landed with no acknowledgement. The freeform
  input's `disabled={isPending}` + `aria-busy={isPending}` are the reference
  shape.
- **Disabled means "not interactive right now"**, not "greyed out for
  decoration". If it's disabled, `aria-disabled` reflects it and clicks are
  actually blocked. WCAG 2.4.11 SC "Focus Not Obscured" and ARIA APG's
  disabled patterns apply.

Do not invent design tokens for these states. Tailwind defaults + shadcn/base
primitives cover every case Yawaragi ships today; the Phase 7 design-system
rework will consolidate.

## Discovery framing

JMStV §6(5) forbids promotional copy. ADR-0006 turns that into: every empty
state, no-match state, error state, and rate-limit state is reframed as
discovery, not failure. The `pnpm i18n:audit` script grep-guards the copy but
cannot spot a "we couldn't find that" that reads correctly and still lands
as a dead end.

Rules:

- **Never use the word "error" in visitor-facing copy.** Neutral zinc, not
  amber. `low_confidence` on `/scan` used to render in amber alert styling;
  #163 stripped it because a low-confidence read is not an error — it's an
  invitation to try a different photo.
- **Every no-match / empty state opens a door.** `no_match` and `ambiguous`
  on `/scan` bridge to `/suggest` ("Explore sake another way") AND offer
  rescan. `suggest.results.noMatch` needs the same shape (open TODO —
  currently a bare paragraph in `src/app/[locale]/suggest/page.tsx`). If a
  state has no onward affordance, add one before you merge.
- **Empty inputs get a starter set, not a placeholder.** The freeform
  suggest input is paired with `<SuggestStarterPrompts />` because "type
  something" is a worse prompt than "here are six examples". Copy this shape
  for any freeform input.
- **Allowed vocabulary**: `discover`, `learn`, `explore`, `try`,
  `entdecken`, `erfahren`, `kennenlernen`, `probieren`. **Forbidden**: `buy`,
  `don't miss`, `limited`, `exclusive`, `Vergiss nicht`, `Nur heute`,
  `Verpasse nicht`. Full list in CLAUDE.md; `pnpm i18n:audit` enforces.

## Dead-end detection

If a surface can produce a no-match, error, degraded, or rate-limit state,
that state MUST offer an inviting next action. The scan `/suggest` bridge is
the reference: even a visitor who scanned a coffee mug reaches an inviting
CTA, not a wall.

Concretely, when you add a state, ask: what's the next thing the visitor
could reasonably want to try? Then wire that as either:

- **An inline affordance** — a `<Link>` to a sibling surface, a rescan
  button. The two `/scan` no-match branches (`no_match`, `low_confidence`)
  are the shape (`src/components/scan/scan-form.tsx`).
- **A retry hint** — if the state is likely to resolve (rate-limit, network),
  the copy names the retry condition ("try again in ~2 hours") rather than
  a generic "something went wrong".

The rate-limit state on `/scan` uses ICU `plural` to always round the retry
window UP so the visitor doesn't bump into the wall a second time. Copy that
pattern for any human-scale wait.

## Loading and optimistic states

Decisions between spinner / skeleton / disabled-button:

- **Spinner:** small, momentary, tied to a single element. Rarely the right
  answer on this stack — most of our slow work happens across a route change,
  which `loading.tsx` covers.
- **Skeleton (`loading.tsx`):** page-level, for RSC segments that take > 1 s
  to stream. The suggest surface has one; scan does not yet need one because
  the vision call is client-initiated and covered by the button's own
  `pending` state.
- **Disabled trigger + label swap:** the default. Any submit / chip / button
  that kicks off async work gets this before it gets a spinner.

Optimistic UI — `useOptimistic` — is not currently used in Yawaragi and is
not the default. Reserve it for cases where you can render the presumed
result correctly without a server round-trip (e.g. inline validation).
Optimistic renders that later get rolled back read as broken.

The right sequence for a click that triggers async work:

1. Frame 0 (≤ 100 ms): button disabled, label = pending, `aria-busy=true`.
2. Frame 1–60 (≤ 1 s): same state persists; no additional chrome.
3. Frame 60+ (> 1 s): if a route change is in flight, `loading.tsx` streams
   in. If it's an in-place update, a skeleton in the same region takes over.

## Accessibility is a design constraint

Not a QA pass. Every rule below is a design decision made when the component
is written, not a fix applied at the end:

- **Every interactive element is keyboard-reachable.** Tab order is the DOM
  order (Yawaragi does not use `tabindex` > 0). If you build a custom control
  it needs an `onKeyDown` handler for Space / Enter or it's broken. WCAG
  2.1.1 SC "Keyboard".
- **Pending states announce.** `aria-busy` on the form or the specific
  trigger, `aria-live="polite"` on the region that will fill with the
  result. Screen-reader users need the same "the system heard me" feedback
  as sighted users. WCAG 4.1.3 SC "Status Messages".
- **Active nav items announce.** `aria-current="page"` on the header nav
  item that matches the current route. `header-nav.tsx#NavLink` is the
  reference shape; copy it for any nav-like list.
- **Portal-mounted UI needs its own title.** base-ui's Dialog, Sheet, and
  Popover REQUIRE a labelled title in the DOM — even when the visible
  chrome makes the title redundant. Use `sr-only` for the invisible case.
  See `header-nav.tsx` (`<SheetTitle className="sr-only">…</SheetTitle>`);
  omitting it silently breaks the ARIA contract.
- **Non-text chrome gets an accessible name.** Icon-only buttons need
  `aria-label`. The `<Menu />` trigger in `header-nav.tsx` reads
  `aria-label={messages.menuOpen}`. WCAG 1.1.1 SC "Non-text Content".
- **`role="alert"` is for actual alerts.** After #163, `low_confidence` on
  `/scan` no longer uses `role="alert"` — it is a soft state, not an
  interruption. Only genuine, blocking error copy takes `role="alert"`.
- **Focus survives portal open / close.** base-ui's Dialog handles focus
  lifecycle (open → move focus in; close → return focus to the trigger)
  automatically; do NOT layer custom focus handlers on top or
  `preventDefault` on its focus events. Reference: base-ui Dialog docs.
- **Portal + animation timing bites Playwright, not the component.** The
  Sheet's fade-in (~200 ms via `data-starting-style:opacity-0`) means a
  Playwright test that asserts on an element INSIDE the portal
  immediately after the trigger click can race the animation. Sequence
  the assertion: wait for `page.getByRole('dialog')` to be visible first,
  then scope inner testid checks under it. See `e2e/header.spec.ts:112`
  after commit `685e9b9` (`test(e2e): stabilise mobile-sheet header
  test`) for the pattern.

## i18n + locale parity

CLAUDE.md's "no English-only strings" rule has UX consequences:

- **New strings land in `messages/en.json` AND `messages/de.json` in the
  same PR.** Merge-gate rule. `pnpm i18n:audit` catches promotional copy;
  the human PR review catches missing keys.
- **Discovery framing survives translation.** German's neutral verbs
  (`entdecken`, `erfahren`, `kennenlernen`) are not one-to-one with the
  English ones; pick the German that reads naturally, not the closest
  literal match. Check for accidental German-promotional keywords the
  `i18n:audit` grep is set to catch.
- **Japanese kanji is data, not translation.** Never wrap kanji strings in
  `t(...)`; they come from Sakenowa (`f1..f6.kanji`) or from the LLM
  extraction, and they're identical across locales.
- **Chip prompts are per-locale content, not machine-translated.**
  `suggest.starter.prompt1..6` in `messages/de.json` are distinct German
  prompts; a German visitor gets `süffig und mild`, not a translation of
  `smooth and mild`. Any freeform surface that seeds the input from copy
  needs the same treatment.
- **`aria-*` attributes are also strings.** The mobile menu's `aria-label`
  goes through next-intl. Do not inline any user-perceptible string,
  including screen-reader-only ones.

## Provenance visibility (UX aspect)

`CLAUDE.md` §"Source provenance" and ADR-0005 own the rule. The UX
consequences on a component:

- **A `<ProvenanceBadge />` sits next to the value it qualifies.** Not in
  a corner of the card, not in a tooltip. The scan result card puts it on
  the same baseline as the sake name (`scan-result-card.tsx`); that's the
  shape.
- **Cross-beverage results carry BOTH the badge AND the disclaimer.**
  ADR-0005's 2026-05-31 update makes this explicit. The badge names the
  provenance kind; the disclaimer names the failure mode.
- **Never blend sources silently in the same card.** If four facts come
  from Sakenowa and one from the LLM, the LLM fact is visually
  distinguished (the badge does the work). Do not remove badges "for
  visual balance".
- **Attribution renders near the data, not in the footer.** CLAUDE.md
  §"Sakenowa attribution" — inline `<SakenowaAttribution />` above the
  fold on any surface that displays Sakenowa flavor / brand / ranking
  data. `/scan`'s result card gained inline attribution in #163 because
  it started showing flavor data on a surface that previously had none.

## Un-stated requirements (the "hidden AC" problem)

The acceptance criteria on a Yawaragi issue describe what the human
remembered to write down. They rarely encode:

- **Reward.** Does a successful action feel like the visitor's action, or
  like the system took over? #163's auto-navigate lost the label photo
  across the route change; the rewrite kept it in place. Ask: after the
  happy path, does the visitor see something that was THEIRS?
- **Feedback within 100 ms.** #184's chip missed this. Ask: from click to
  next visible frame, what does the visitor see?
- **Dead-end behaviour.** Every no-match / no-result / rate-limit / error
  state — does it invite the next action?
- **i18n parity.** English strings shipping without German is a merge
  block, not a follow-up.
- **JMStV framing.** Every new state's copy — is it discovery, or is it
  quietly promotional?
- **Provenance surface.** Any newly-rendered fact — where does it come
  from, and is that source visible?
- **Age-gate scope.** If the surface displays flavor / brand /
  recommendation data, is the route in
  `src/lib/legal/age-gate-cookie.ts#UNGATED_LOCALE_PATHS` correctly? ADR-0015
  is the reference for gating a whole route rather than gating the render.
- **Recruiter snap-judgement.** Would a stranger opening this URL cold in
  two minutes form a good impression? If you're not sure, screenshot the
  surface at three viewports (`mobile-layout-bug-repro` skill or manual)
  and look at it.

If an AC checkbox says "the button works", read it as "the button works
across all of the above". The AC never spells it out; the implementer must.

## Single source of visual truth

A recurring visual element — a badge, a disclaimer, an attribution line, a
chart, an axis label — has **exactly one component**, and every surface renders
that component. Never hand-roll a second copy inline "just here".

Why this is a hard rule, not a preference:

- **Consistency is automatic, not policed.** When the cross-beverage
  disclaimer's amber "warning" look was softened to a quiet neutral footnote,
  it was a one-line change to `HeuristicDisclaimerView` and every surface —
  suggest, scan, landing, /profile — updated at once. Had any surface inlined
  its own amber copy, it would have silently drifted out of sync and kept the
  old look. A divergent copy is a bug that ships looking fine.
- **Invariants live in the component, not in reviewers' memory.** The
  disclaimer's title-visible-but-body-in-tooltip structure, the provenance
  badge's on-the-baseline placement, the axis label's romaji+kanji rule — these
  are CLAUDE.md mandates. Encoded once in the component, they can't be
  forgotten on the fifth surface that needs them.
- **The restyle stays cheap.** Design iteration (like the disclaimer pass
  above) is a component edit, not a find-and-replace across the app.

The canonical components (extend this list as new shared elements appear):
`<ProvenanceBadge />` / `ProvenanceBadgeView`, `<HeuristicDisclaimer />` /
`HeuristicDisclaimerView`, `<SakenowaAttribution />`, `<FlavorAxisLabel />`,
`<FlavorRadarView />` + `<FlavorProfileView />`. If you need a shared element
that doesn't have a component yet, **create the component** — don't inline it
and leave the extraction "for later". The split into a sync presentational
`*View` (unit-testable) + an async i18n wrapper is the established shape.

If you're restyling a shared element: change it in the one component, and
confirm no inline copy exists (`grep` the hardcoded classes / copy). Two copies
means the wrong one is already shipping somewhere.

## Pre-flight checklist

Run before declaring any interactive UI slice done. Verb-first, deterministic;
if any answer is "no" or "unsure", do not open the PR. Cross-referenced by
`.claude/skills/self-review` Phase 3 when the diff touches interactive UI.

1. **Click-in-100 ms**: does every interactive element render a visible
   acknowledgement (label swap / `aria-busy` / disabled) in the frame the
   click landed? (Test by clicking with dev-tools throttling on.)
2. **Pending label localised**: does the pending state render via a
   next-intl key present in BOTH `en.json` and `de.json`? (Grep the two files.)
3. **No dead ends**: does every no-match / empty / error / rate-limit branch
   offer at least one onward affordance (rescan, bridge to sibling surface,
   named retry window)?
4. **Discovery copy**: does every visitor-facing string read as discovery,
   never promotion or failure? (`pnpm i18n:audit` clean; also eyeball the
   German — the grep catches known phrases, not tone.)
5. **Focus visible**: does every clickable element show a `focus-visible`
   ring under keyboard navigation? (Tab through the surface.)
6. **Portal primitives labelled**: does every Dialog / Sheet / Popover have
   a title (visible or `sr-only`) in the DOM?
7. **`aria-current` on nav-like lists**: does the active item announce?
8. **Provenance badges present**: does every LLM-extracted, LLM-inferred, or
   cross-beverage-mapped value render a `<ProvenanceBadge />` on the same
   baseline? Does a cross-beverage result also render `<HeuristicDisclaimer />`?
9. **Attribution inline**: does every surface that shows Sakenowa flavor /
   brand / ranking data render `<SakenowaAttribution />` above the fold or
   inline near the data?
10. **Route gate correct**: if the surface displays flavor / brand /
    recommendation data, is the route path OUTSIDE
    `UNGATED_LOCALE_PATHS`? (An unaccepted deep-link visitor must not see
    the data — even in the DOM.)
11. **i18n parity**: does every new user-facing string (including
    `aria-label`s) exist in `en.json` AND `de.json`? Do the German prompts
    read as natural German, not machine translation?
12. **Reward preserved on happy path**: after the successful action, does
    the surface show something that felt like it belonged to the visitor
    (their photo, their query, their choice)? Or did the state reset?
13. **Shared element from its canonical component**: is every recurring visual
    element (provenance badge, heuristic disclaimer, Sakenowa attribution,
    flavor axis label, radar / bar chart) rendered from its one shared
    component — not a hand-rolled inline copy? (See "Single source of visual
    truth". A second copy silently drifts out of sync.)

If your slice touched a state, a click, or a copy string, run the checklist.
Green means every question answered "yes"; anything else is a merge block.

## Sources

Yawaragi incidents cited (`gh issue view <n>` / `gh pr view <n>` for detail):

- Issue #163 / PR #183 — `/scan` in-place render, ADR-0015. Reward-preservation
  and dead-end reframing.
- Issue #184 — starter-chip no-feedback. 100 ms feedback rule.
- Issue #162 / PR #179 — persistent header. `aria-current`, portal titles,
  focus-visible.
- Issue #144 / PR #173 — freeform-text suggest surface. `useTransition` +
  pending-label pattern.
- ADR-0005 — provenance-badge rule and cross-beverage badge + disclaimer
  coexistence.
- ADR-0006 — JMStV age-gate + discovery-framing constraint.
- ADR-0015 — in-place scan result, route-level gating rationale.

External:

- Nielsen Norman Group — "Response Times: The 3 Important Limits"
  (<https://www.nngroup.com/articles/response-times-3-important-limits/>).
- WCAG 2.2 Success Criteria — 1.1.1 Non-text Content, 2.1.1 Keyboard,
  2.4.7 Focus Visible, 2.4.11 Focus Not Obscured, 4.1.3 Status Messages
  (<https://www.w3.org/TR/WCAG22/>).
- React docs — `useTransition`
  (<https://react.dev/reference/react/useTransition>) and the
  "resetting state with a key" pattern
  (<https://react.dev/learn/preserving-and-resetting-state>).
- next-intl docs — typed navigation and message-key hygiene
  (<https://next-intl.dev/>).
- base-ui docs — Dialog title requirement, focus lifecycle
  (<https://base-ui.com/>).
