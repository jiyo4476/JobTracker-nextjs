import { defineConfig } from '@playwright/test'
import { IDENTITIES, port, serverEnv } from './e2e/identities'

/**
 * PAGE-017 end-to-end harness.
 *
 * ## Prerequisites
 *
 * 1. A reachable PostgreSQL 18 database with the Drizzle migrations applied:
 *      docker compose up -d db          (from the workspace root)
 *      DATABASE_URL=… npm run db:migrate
 * 2. Playwright browsers:
 *      npx playwright install chromium
 *
 * ## Running
 *
 *      DATABASE_URL=postgresql://… npm run test:e2e
 *
 * The config boots three `next dev` servers, one per simulated identity — see
 * `e2e/identities.ts` for why identity is per-SERVER rather than per-session. They share
 * the database, so cross-user leakage would be visible immediately.
 *
 * Nothing here touches the production build: each server gets its own `NEXT_DIST_DIR`,
 * and `distDir` in `next.config.ts` still defaults to `.next`.
 *
 * > Known dev-server side effect: `next dev` appends a `<distDir>/types/**` entry to
 * > `tsconfig.json` for every dist dir it boots, so a run leaves three transient
 * > `.next-e2e-*` include lines behind. They are build-output paths, not source — discard
 * > them (`git checkout tsconfig.json`) after a local run. The directories themselves are
 * > gitignored and eslint-ignored.
 */
export default defineConfig({
  testDir: './e2e',
  testMatch: /.*\.spec\.ts/,
  globalSetup: './e2e/global-setup.ts',
  // Two identities mutating the same catalog job is the whole point; running specs in
  // parallel against one shared database would make failures ambiguous.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : [['list']],
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    // Functional suite. The @perf budgets are opt-in — they throttle to mobile-4G with a
    // 4x CPU slowdown and are slow by design.
    { name: 'chromium', use: { browserName: 'chromium' }, grepInvert: /@perf/ },
    { name: 'perf', use: { browserName: 'chromium' }, grep: /@perf/ },
  ],
  webServer: IDENTITIES.map((identity) => ({
    command: `npx next dev --port ${port(identity)}`,
    url: `${identity.origin}/api/health/live`,
    env: serverEnv(identity),
    // A cold Next dev boot plus first compile is slow; be generous rather than flaky.
    timeout: 180_000,
    reuseExistingServer: !process.env.CI,
    stdout: 'pipe',
    stderr: 'pipe',
  })),
})
