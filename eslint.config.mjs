import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Force `@/` path alias for any import that climbs two or more directory
  // levels (`../../*`, `../../../*`, etc.). Single-level `../foo` stays
  // allowed for genuinely sibling files inside the same module. Without this
  // rule, agent-authored files at deep tree positions (e.g.
  // `src/app/api/.../route.ts`) drift into `../../../../lib/...` import paths
  // that obscure provenance and break the moment a file moves.
  {
    files: ["**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["../../*"],
              message:
                "Use the `@/` path alias instead of climbing two or more directory levels.",
            },
          ],
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // node_modules was implicitly skipped before but `globalIgnores()` above
    // *replaces* eslint-config-next's defaults — re-state it explicitly.
    // Surfaced when adding @testcontainers/postgresql + pg, whose .d.ts files
    // trip the base rules (@ts-ignore, unused __Unused vars, etc.).
    "node_modules/**",
    // Local agent worktrees live inside the repo; don't lint them as
    // sibling copies of src/ — they're separate git checkouts.
    ".claude/**",
  ]),
]);

export default eslintConfig;
