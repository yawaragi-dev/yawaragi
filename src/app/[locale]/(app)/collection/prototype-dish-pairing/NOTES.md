# PROTOTYPE: pick a bottle from my cellar for a dish

**Question:** what should "Pick for a dish" look like: its own screen (A, B) or a mode of the Cellar list (C)? How do dishes get picked, and how do the bottles the table can't place show?

**Open it:** `pnpm dev`, accept the 18+ gate, then `/en/collection/prototype-dish-pairing` (`/de/...` for German). The bar at the bottom (or ← / →) switches `?variant=A|B|C`; its right-hand button switches `?cellar=full|empty`; `?dish=<id>` preselects a dish.

**Throwaway.** Fixture cellar only (`fixture-cellar.ts`), no writes, and the dish choice is stored nowhere. Linked from nowhere; 404 on production. Design questions: `docs/design-questions.md` block AG.

**Verdict:** _(to fill in once the designers and the maintainer have picked: which variant, what to take from the others)_

When it is decided, delete this folder, `src/components/prototype/` and the `prototypeDishPairing` message block. Then build the winner properly: move `DISH_GROUPS` to `src/lib/pairing/`, give it tests, and read the real cellar.
