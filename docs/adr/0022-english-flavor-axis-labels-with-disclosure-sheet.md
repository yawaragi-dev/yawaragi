# English flavor-axis labels, with a disclosure sheet

**Status:** accepted — 2026-09-26 (supersedes the "never English-only" rule for the six FlavorAxes in CLAUDE.md and `CONTEXT.md#FlavorAxis`; adopted with design v1.4, §16–§17)

## Context

Since Phase 2 the project has carried an absolute rule: the six Sakenowa flavor axes are **never** rendered with only an English label. `<FlavorAxisLabel />` shows romaji and kanji inline and puts the English approximation plus a brewer's-term caveat in a tooltip. Six tests in `flavor-axis-label.test.tsx` pin it.

The rule exists for a good reason. `hanayaka` (華やか), `hojun` (芳醇), `juko` (重厚), `odayaka` (穏やか), `dry` (ドライ) and `keikai` (軽快) are Japanese brewers' terms with no exact Western equivalent. "Floral" is an approximation, not a translation, and a user who reads only "Floral" is being told something subtly false. `CONTEXT.md` therefore makes romaji the canonical identifier and calls the English labels "approximations only".

The design handoff renders the axes as six English words — Floral, Mellow, Rich, Mild, Dry, Light — in a two-column grid with no romaji, no kanji and no inline tooltip. Stacking three lines per axis in each of six rows, twice over (the result-card chart and the Palate list), was judged to cost more in legibility than the inline Japanese bought in accuracy, especially at the screen sizes and dim-room brightness this product targets.

The two positions looked irreconcilable until design v1.1 §10, which kept the disclosure but moved it: an **info button beside the chart heading** opens a sheet listing all six with their Japanese terms, their romaji, a one-line note each, and an explicit statement that the English words are approximations of brewers' terms rather than translations. v1.4 generalised this into §16, the canonical pattern for *every* inferred or approximate claim — the same shape already used for the cross-beverage caveat after the UX-F density pass (#167).

## Decision

1. **The six axes render as English words** in the flavor chart and the Palate list: Floral, Mellow, Rich, Mild, Dry, Light, in that order — which is exactly `f1…f6`.
2. **The Japanese terms are disclosed, not dropped.** The chart heading carries an info button that opens the §16 sheet listing all six as `English · 日本語 · romaji · note`, prefaced by the statement that these are brewers' terms and the English words are approximations.
3. **Nothing below the presentation layer moves.** The `FlavorAxis` enum stays `f1..f6`, `FLAVOR_AXIS_ROMAJI` stays the romaji lookup, romaji stays the canonical *domain* name in `CONTEXT.md` and in LLM prompts, and the i18n keys stay `flavorAxis.<f1..f6>.*`. The English words are a presentation layer keyed off the enum and translated per locale like any other string.
4. **This is a presentation decision, not a data one.** Nothing about provenance, the Sakenowa licence or the trademark rule changes.

## Consequences

- `<FlavorAxisLabel />` stops rendering romaji and kanji inline. The six tests in `flavor-axis-label.test.tsx` that assert inline romaji + kanji are rewritten to assert the English label plus a reachable disclosure. **The rewrite is the point of this ADR** — without it, a green test suite would be enforcing a rule the project no longer holds.
- The accessibility guarantee is preserved in the same shape as `<HeuristicDisclaimer />`: the caveat text stays in the DOM and is wired to the info button via `aria-describedby`, so a screen reader reaches it without interaction. Do not "simplify" this into a click-only sheet with no static text.
- **The disclosure is load-bearing, not decorative.** A flavor chart shipped without a reachable info sheet is a regression against this ADR, not merely against the design. Pin it with a test on the shared chart component.
- The English words become translatable strings (EN + DE) like everything else. German gets its own six approximations; the Japanese terms are data and stay verbatim in both locales.
- CLAUDE.md's "6-axis flavor vocabulary" table remains the authority for the romaji ↔ kanji ↔ approximation mapping. Only the *rendering* rule beneath it changes.

## Alternatives considered

- **Keep romaji + kanji inline, deviate from the design.** Rejected on legibility: six rows × three lines, in two places, on a 390px-wide screen in a dim room.
- **English inline with a per-axis tooltip** (the status quo, inverted). Rejected because six tooltips on one chart is worse than one sheet covering all six, and a per-axis tooltip is a poor target on touch.
- **English-only with no disclosure anywhere.** Rejected. That is the version that tells the user something false, and it is the only one of the three that the original rule was actually written to prevent.
