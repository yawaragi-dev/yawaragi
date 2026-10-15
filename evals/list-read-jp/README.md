# `evals/list-read-jp/` — reading a whole menu or shelf

Informational eval for design v1.7 §7 ("Rank these for you"): how many of the
sakes on a menu or shelf photo end up as the right catalogue row. Not a test;
CI runs only `judge.test.ts`.

## The corpus

No photos of its own. It reads the **menu and shelf photos of
`evals/label-scan-jp/`** — the entries with `subject: "menu"` or
`subject: "several_bottles"` — and scores against their `items`, which list
every drink legibly printed or standing in the frame, each with its catalogue
rows. That ground truth was written for this eval before it existed (see the
label-scan README, "Photos that are not one sake bottle"), so adding a menu or
shelf photo there adds it here.

49 photos today: 22 menus (11 of them local-only, in `photos/local/`) and 27
shelves, holding 132 catalogue sakes between them.

## What it measures

Per photo, per reader (`judge.ts`, unit-tested):

- **found** — a catalogue sake on the photo shown as a row of that sake;
- **missed** — a catalogue sake on the photo not shown as its row (read as
  something else, left under "Couldn't match", or not read at all);
- **wrong rows** — a row for a sake that is not on the photo. The costly
  error: the visitor is told a sake is on the list that is not;
- **non-sake shown as sake** — a row for a non-sake item that Sakenowa
  happens to list.

The ranking itself is not scored: it is deterministic arithmetic over the
charts and the visitor's ratings (`src/lib/scan/rank-list.ts`) and has unit
tests.

## Running it

```sh
LIST_READ_EVAL_OFFLINE=1 pnpm eval list-read-jp     # saved reads only; lists what a real run would read
pnpm eval list-read-jp                              # reads what is not saved yet (paid)
LIST_READ_EVAL_MODELS=sonnet-5-5-low,haiku-5-5-low pnpm eval list-read-jp
LIST_READ_EVAL_ONLY=ide_menu pnpm eval list-read-jp # only photos whose name contains it
```

Every read is saved to `recordings/reads.json` with the tokens it used, keyed
by reader and by a fingerprint of the prompt; a prompt change makes every
saved read stale, and the next run reads them all again. Matching runs fresh
each time against `DATABASE_URL`, so a change to the lookup is measured at no
model cost. **Quote the cost before a paid run** (the runner prints what each
saved read cost on average) and never start two at once.

Readers: `sonnet-5-5`, `haiku-5-5`, and both at `effort: low`. The app reads
lists with `LIST_READER_MODEL` / `LIST_READER_EFFORT` in
`src/lib/ai/vision/list-reader.ts`.
