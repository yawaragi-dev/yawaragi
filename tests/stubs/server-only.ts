// Empty stub aliased into vitest for the `server-only` package. See the
// `resolve.alias` block in vitest.config.mts (and vitest.integration.config.mts)
// for rationale: `server-only` is a transitive of `next` and pnpm strict
// isolation hides it from the vitest runner, but Vite's import-analysis
// still tries to resolve it. The real package only exists to throw when
// imported into a client bundle; in vitest that case can't arise, so an
// empty module is a faithful stand-in.
export {}
