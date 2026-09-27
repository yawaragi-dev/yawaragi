# Dark-only, and the forced `dark:` variant

**Status:** accepted — 2026-09-27 (adopted with the design v1.4 app shell; see `design/README.md` § "Design tokens")

## Context

Ginshu has no light theme. The design's palette is a single warm-ash dark ground with a ginshu accent, chosen for reading a bottle label in a dim izakaya, and `design/README.md` names exactly one value per role. There is no second column to implement.

The code arrived from the other direction. Since Phase 1 the app has followed the system colour scheme: shadcn's greyscale tokens under `:root`, a `@media (prefers-color-scheme: dark)` block overriding them, and **40 component files** carrying paired utilities — `bg-white dark:bg-zinc-900`, `text-zinc-900 dark:text-zinc-100`.

Repointing the tokens at Ginshu is most of the port. But it breaks those 40 files in a way that is invisible to anyone developing in dark mode: with the ground unconditionally `#1b1a19` and `dark:` still gated on the OS preference, a visitor whose system prefers **light** gets every light branch — white cards, near-black text — painted on a dark ground. Unreadable, and it never appears on the developer's screen.

So the flip forces a choice about those 40 files, and it has to be made in the same change that flips the tokens.

## Decision

1. **Ginshu is dark-only.** No light palette, no theme toggle, no `prefers-color-scheme` branch. One set of token values.
2. **The `dark:` variant is redefined to always match** — `@custom-variant dark (&)` in `globals.css`. Every existing `dark:` utility renders for every visitor.
3. **The light-branch utilities beside them are dead weight, and are removed per surface as each is ported**, not in one sweep.
4. **New components do not add `dark:` variants.** There is nothing to distinguish; a new `dark:` pair is a light branch that will never render, plus a reader wondering which theme it is for.

## Consequences

- The 40 files keep compiling and rendering correctly with no edit. That is the point: a 40-file sweep would have collided with every open port PR, and touching a component's colours is exactly what its own port PR is for.
- **`dark:` in this codebase now means "always", which is a lie the variant name tells.** That is the real cost, and the reason this ADR exists rather than a comment. A reader who does not know will add a `light` branch expecting it to render somewhere. CLAUDE.md's anti-pattern list carries the rule; this file carries the why.
- A future light theme would have to undo item 2 first, then audit all 40 files, because by then some will have lost their light branch to item 3. That is a deliberate one-way door: shipping the dark-only design well beats keeping an unbuilt light theme cheap.
- Nothing about the tokens' *values* is decided here — those are the design's, transcribed in `globals.css` under `@theme`.

## Alternatives considered

- **Strip the light branches from all 40 files in the flip PR.** Honest, and leaves no misleading variant. Rejected on collision: the PR would touch nearly every component in the app while the port MRs are rewriting those same components, and a conflict in a colour utility is the kind a rebase resolves wrongly and silently.
- **Leave `dark:` gated on the OS preference and repoint only `:root`.** What the tokens-only PR (#302) deliberately did, and it worked precisely because the semantic tokens were then unused. Once they are live it produces the light-on-dark failure above for a real class of visitor.
- **Keep a light theme.** Not ours to decide — the design specifies one palette, and inventing a second would be inventing design.
