# Vitest mocks: transitive-import gotchas

Notes for writers of new vitest unit tests. Both entries below have already
bitten this repo once and are cheap to re-encounter — read this file before
adding a new `vi.mock(...)` for a Next.js or next-intl module.

## Rule of thumb

If your test subject transitively imports a package that lives under
`node_modules/` and that package in turn imports another package we also
mock (e.g. `next-intl/navigation → next/navigation`), the top-level
`vi.mock(...)` in `vitest.setup.ts` **only** reaches through the chain when
the intermediate package is listed in `vitest.config.mts` under
`test.server.deps.inline`.

The reason is Vite's default behaviour: dependencies under `node_modules`
are externalised (loaded straight through Node), so Vite's transformer —
and therefore vitest's mock hoister — never sees the transitive `import
'next/navigation'` statement. Inlining forces Vite to process the package
source, which lets the mock registry intercept the transitive resolution.

## `next-intl` — inlined

`next-intl` is inlined in `vitest.config.mts` so that

```
your test subject
  → @/i18n/navigation
    → next-intl/navigation
      → next/navigation   ← vi.mock('next/navigation', …) applies here
```

works without every test file having to redeclare a local
`vi.mock('@/i18n/navigation', …)`.

Concretely this means:

- **Do NOT** add a per-file `vi.mock('@/i18n/navigation', …)` or
  `vi.mock('next-intl/navigation', …)`. The top-level stub covers it.
- If `next-intl` starts calling a new symbol on `next/navigation` (e.g.
  a future minor version pulls in `useSelectedLayoutSegment`), you will
  see a runtime error like:

  ```
  Error: [vitest] No "<symbol>" export is defined on the "next/navigation" mock.
  ```

  Fix: add the symbol to the `vi.mock('next/navigation', …)` factory in
  `vitest.setup.ts`. Do **not** work around it by adding a per-file mock.
- If another package develops the same shape (its own copy of
  `next/navigation` from strict pnpm isolation, or a similar transitive
  chain), add it to the `inline` array in `vitest.config.mts` with a
  comment explaining why.

## `server-only` — path-aliased

`server-only` is a marker package shipped as a transitive of `next`.
Under pnpm's strict-isolation node_modules layout the vitest runner
can't resolve it via the package name. We alias it to a local no-op
stub in `vitest.config.mts` (see the `resolve.alias` block) so any
`import 'server-only'` inside app code becomes a no-op inside vitest.

If you write a test for a `import 'server-only'` module and see
`Failed to resolve import "server-only"`, the alias is not being
applied — probably because a new vitest project config was added
without inheriting the root `resolve.alias`. Re-add the alias there.

## History

- Discovered during PR #161 round 6a (scan action test). The gotcha
  was originally papered over with a per-file
  `vi.mock('@/i18n/navigation', …)` and inline comment; issue #171
  tracked the follow-up. Resolved by inlining `next-intl` — see the
  commit that introduced this doc.
