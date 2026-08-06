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
    ".claude/worktrees/**",
    "coverage/**",
    "hooks/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // PAGE-017 e2e harness build output (one dev-server dist dir per simulated
    // identity — see playwright.config.ts). Never source.
    ".next-e2e-*/**",
    "playwright-report/**",
    "test-results/**",
  ]),
]);

export default eslintConfig;
