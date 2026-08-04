import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  AuthenticationError,
  requireUser,
  type UserPrincipal,
} from "@/lib/auth";
import { resolveUser } from "@/lib/users";
import { logger } from "@/lib/logger";

/**
 * API-013 — shared per-request owner resolution for interactive routes.
 *
 * This is the single composition every personal route uses to go from "a verified
 * request" to "the internal user id we scope all owner-predicated queries by":
 *
 *   1. `requireUser(req)` — verifies the request and REJECTS service principals
 *      (scraper / ingestion tokens). Interactive personal state must only ever be
 *      created or read on behalf of an interactive human `kind: "user"` principal.
 *   2. `resolveUser({ issuer, subject })` — upserts and returns the stable internal
 *      `users.id`. The identity comes ONLY from the verified principal — never from a
 *      URL, body, query string, or header.
 *   3. Reject a deactivated account (`is_active = false`) fail-closed.
 *
 * The resolved id is what callers pass to `withUser(user.id, …)` and use in every
 * explicit `user_id` predicate.
 */

export type ResolvedRequestUser = {
  /** Stable internal users.id — the owner key for every personal query. */
  id: number;
  issuer: string;
  subject: string;
  /**
   * Presentation metadata mirrored from the resolved row. These are NOT identity
   * keys (see `resolveUser`) — they are optional, mutable display fields safe to
   * surface to the authenticated owner (e.g. `/api/me`). Never use them to look up,
   * match, or authorize a user.
   */
  email: string | null;
  displayName: string | null;
  /** The verified principal, for correlationId / scopes / logging. */
  principal: UserPrincipal;
};

/**
 * Throwing composition (mirrors `requireUser`). Throws `AuthenticationError` with:
 *   - `unauthenticated` / `wrong_principal` — no/invalid principal, or a service
 *     principal that must not enter an interactive route.
 *   - `inactive_user` — a resolved but deactivated account.
 *
 * Prefer `resolveRequestUser` in route handlers so the failure maps to a response
 * without a bare try/catch in every handler.
 */
export async function requireResolvedUser(req: NextRequest): Promise<ResolvedRequestUser> {
  // Rejects unauthenticated callers and service principals (kind !== "user").
  const principal = await requireUser(req);

  const resolved = await resolveUser({
    issuer: principal.issuer,
    subject: principal.subject,
  });

  if (!resolved.isActive) {
    logger.warn("resolved user is inactive", {
      correlationId: principal.correlationId,
      code: "inactive_user",
      userId: resolved.id,
    });
    throw new AuthenticationError("inactive_user", principal.correlationId);
  }

  return {
    id: resolved.id,
    issuer: resolved.issuer,
    subject: resolved.subject,
    email: resolved.email,
    displayName: resolved.displayName,
    principal,
  };
}

type ResolveRequestUserResult =
  | { ok: true; user: ResolvedRequestUser }
  | { ok: false; response: NextResponse };

/**
 * Route-handler guard. Returns the resolved user, or a ready-to-return response:
 *   - 401 { error: 'Unauthorized' } for missing/invalid/wrong-principal auth
 *   - 403 { error: 'Forbidden' } for a deactivated account
 *
 *   const auth = await resolveRequestUser(req)
 *   if (!auth.ok) return auth.response
 *   const { user } = auth
 */
export async function resolveRequestUser(req: NextRequest): Promise<ResolveRequestUserResult> {
  try {
    return { ok: true, user: await requireResolvedUser(req) };
  } catch (err) {
    if (err instanceof AuthenticationError) {
      if (err.code === "inactive_user") {
        return {
          ok: false,
          response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
        };
      }
      return {
        ok: false,
        response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
      };
    }
    throw err;
  }
}
