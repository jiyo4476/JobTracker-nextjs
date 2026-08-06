import type { NextRequest } from 'next/server'
import { privateJson } from '@/lib/http'
import { resolveRequestUser } from '@/lib/resolved-user'

/**
 * AUTH-003 / API-013 — client-readable identity endpoint.
 *
 * `GET /api/me` is the ONLY way the browser learns its own server-resolved internal
 * user id. AUTH-003's principal context is server-only; the client cannot see the
 * resolved `users.id` needed to build per-user React Query keys or to clear cached
 * personal data when the signed-in identity changes. This endpoint closes that gap.
 *
 * Contract (stable — PAGE-017 keys React Query on it):
 *   200 { user_id: number, email: string | null, display_name: string | null,
 *         is_admin: boolean }
 *   401 { error: 'Unauthorized' }   — unauthenticated OR a service principal
 *   403 { error: 'Forbidden' }      — a resolved but deactivated account
 *
 * `is_admin` mirrors the SERVER-side catalog-admin decision (`identityIsAdmin`, derived
 * only from the verified token's groups/scopes). It exists so the UI can hide catalog
 * mutation affordances from non-admins. It is a PRESENTATION hint only — every catalog
 * mutation is independently re-authorized by `resolveAdminUser` on the admin routes, so
 * a tampered client gains nothing.
 *
 * Security invariants:
 *   - Interactive-only. `resolveRequestUser` → `requireUser` REJECTS service
 *     (scraper / ingestion) principals; there is no "me" for a machine token.
 *   - `user_id` is the SERVER-resolved `users.id` derived solely from the verified
 *     `(issuer, subject)` principal. It is never read from the URL, body, query, or
 *     a header.
 *   - The response NEVER echoes the raw token, the OAuth `(issuer, subject)` identity
 *     keys, scopes, or any other claim. `email` / `display_name` are optional,
 *     non-identity presentation metadata only (see `resolveUser`).
 *   - `private, no-store` via `privateJson` so a shared proxy can never cache one
 *     user's identity and serve it to another.
 */
export async function GET(req: NextRequest) {
  const auth = await resolveRequestUser(req)
  if (!auth.ok) return auth.response

  const { id, email, displayName, principal } = auth.user

  return privateJson({
    user_id: id,
    email,
    display_name: displayName,
    is_admin: principal?.isAdmin === true,
  })
}
