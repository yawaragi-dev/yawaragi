import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // node_modules was implicitly skipped before but `globalIgnores()` above
    // *replaces* eslint-config-next's defaults — re-state it explicitly.
    "node_modules/**",
    // Claude Code agent worktrees live inside the repo; don't lint them as
    // sibling copies of src/ — they're separate git checkouts with their
    // own .next/build output.
    ".claude/**",
  ]),
]);

export default eslintConfig;
