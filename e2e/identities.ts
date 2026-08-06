/**
 * PAGE-017 e2e — the three simulated identities.
 *
 * ## Why three servers instead of three browser sessions
 *
 * Auth is OAuth2/OIDC (`src/lib/auth.ts`). Locally there is one non-production escape:
 * `AUTH_DEV_ALLOW_SAME_ORIGIN=true` plus `AUTH_DEV_ISSUER` / `AUTH_DEV_SUBJECT`, which
 * makes an unauthenticated same-origin request resolve to one fixed principal. Those are
 * PROCESS-level environment variables, so a single Next process can only ever be one
 * user — there is no per-request identity switch, and deliberately so: adding a
 * header-driven identity override would widen a security-sensitive surface just to make
 * testing convenient.
 *
 * The harness therefore runs three dev servers against ONE shared database:
 *
 *   :3100  e2e-admin   AUTH_DEV_ADMIN=true  — seeds catalog postings through the real
 *                                             admin API, and proves the admin affordances
 *   :3101  e2e-user-a  ordinary user
 *   :3102  e2e-user-b  ordinary user
 *
 * Same database, three identities, separate browser contexts. That is exactly the
 * condition PAGE-017's acceptance criterion describes: independent stage, priority,
 * notes, contacts, history, dashboard and cache behaviour for the SAME job id.
 *
 * `next dev` (not `next start`) is required: the dev escape is guarded by
 * `NODE_ENV !== 'production'`, and `next start` sets `NODE_ENV=production`.
 */

export type E2EIdentity = {
  name: string
  origin: string
  subject: string
  distDir: string
  isAdmin: boolean
}

export const E2E_ISSUER = process.env.E2E_AUTH_ISSUER ?? 'http://local-development/'

export const ADMIN: E2EIdentity = {
  name: 'admin',
  origin: process.env.E2E_ADMIN_ORIGIN ?? 'http://localhost:3100',
  subject: 'e2e-admin',
  distDir: '.next-e2e-admin',
  isAdmin: true,
}

export const USER_A: E2EIdentity = {
  name: 'user-a',
  origin: process.env.E2E_USER_A_ORIGIN ?? 'http://localhost:3101',
  subject: 'e2e-user-a',
  distDir: '.next-e2e-user-a',
  isAdmin: false,
}

export const USER_B: E2EIdentity = {
  name: 'user-b',
  origin: process.env.E2E_USER_B_ORIGIN ?? 'http://localhost:3102',
  subject: 'e2e-user-b',
  distDir: '.next-e2e-user-b',
  isAdmin: false,
}

export const IDENTITIES = [ADMIN, USER_A, USER_B] as const

export function serverEnv(identity: E2EIdentity): Record<string, string> {
  return {
    NODE_ENV: 'development',
    NEXT_DIST_DIR: identity.distDir,
    NEXT_TELEMETRY_DISABLED: '1',
    DATABASE_URL: process.env.DATABASE_URL ?? '',
    AUTH_DEV_ALLOW_SAME_ORIGIN: 'true',
    AUTH_DEV_ISSUER: E2E_ISSUER,
    AUTH_DEV_SUBJECT: identity.subject,
    ...(identity.isAdmin ? { AUTH_DEV_ADMIN: 'true' } : {}),
  }
}

export function port(identity: E2EIdentity): number {
  return Number(new URL(identity.origin).port)
}
