import { request } from '@playwright/test'
import { ADMIN, USER_A, USER_B, type E2EIdentity } from './identities'

/**
 * Fails FAST and loudly when a precondition is missing, so a broken environment can never
 * be mistaken for a passing isolation suite.
 *
 * Checks, in order:
 *   1. DATABASE_URL is set (the servers cannot resolve a user without it).
 *   2. Each identity's server answers `/api/me` with a DISTINCT `user_id`. If two servers
 *      resolve to the same user, the whole suite is meaningless — the "two users" would
 *      be one — so that is a hard failure here rather than a subtly green run.
 *   3. The admin identity really is `is_admin`, and the two ordinary identities are not.
 */
async function whoami(identity: E2EIdentity) {
  const context = await request.newContext({
    baseURL: identity.origin,
    extraHTTPHeaders: { origin: identity.origin },
  })
  try {
    const response = await context.get('/api/me')
    if (!response.ok()) {
      throw new Error(
        `[${identity.name}] GET ${identity.origin}/api/me returned ${response.status()}. ` +
        'The dev same-origin escape (AUTH_DEV_ALLOW_SAME_ORIGIN / AUTH_DEV_ISSUER / ' +
        'AUTH_DEV_SUBJECT) is not in effect, or the database is unreachable.',
      )
    }
    return await response.json() as { user_id: number; is_admin: boolean }
  } finally {
    await context.dispose()
  }
}

export default async function globalSetup() {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      'DATABASE_URL is required for the PAGE-017 e2e suite. Start PostgreSQL and apply ' +
      'the Drizzle migrations (npm run db:migrate) before running npm run test:e2e.',
    )
  }

  const [admin, userA, userB] = await Promise.all([whoami(ADMIN), whoami(USER_A), whoami(USER_B)])

  const ids = new Set([admin.user_id, userA.user_id, userB.user_id])
  if (ids.size !== 3) {
    throw new Error(
      `The three e2e servers resolved to ${ids.size} distinct users (admin=${admin.user_id}, ` +
      `user-a=${userA.user_id}, user-b=${userB.user_id}). Every server must run with its own ` +
      'AUTH_DEV_SUBJECT, otherwise the isolation assertions prove nothing.',
    )
  }

  if (!admin.is_admin) {
    throw new Error('The admin e2e server is not resolving an admin principal (AUTH_DEV_ADMIN=true).')
  }
  if (userA.is_admin || userB.is_admin) {
    throw new Error('An ordinary e2e identity resolved as admin; the non-admin assertions would be vacuous.')
  }

  process.env.E2E_USER_A_ID = String(userA.user_id)
  process.env.E2E_USER_B_ID = String(userB.user_id)
}
