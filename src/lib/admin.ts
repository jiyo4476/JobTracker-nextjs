import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { AuthenticationError } from "@/lib/auth";
import { requireResolvedUser, type ResolvedRequestUser } from "@/lib/resolved-user";
import { logger } from "@/lib/logger";

/**
 * API-013 slice 1 — the interactive catalog-admin gate.
 *
 * The shared job/company catalog (title, company, description, salary, source metadata,
 * dates, taxonomy, and global active/deleted state) is admin-controlled. Ordinary users
 * never mutate it; they add an existing catalog job to their own tracker via
 * `PUT/PATCH /api/jobs/[id]/state`.
 *
 * `requireAdminUser` composes `requireResolvedUser` (which rejects service principals and
 * deactivated accounts) and then requires a verified admin claim. The admin decision is
 * made at the auth layer from the verified token's groups/scopes only (see
 * `identityIsAdmin` in `@/lib/auth`) — it can never be asserted through a request body,
 * header, query string, or URL.
 */
export async function requireAdminUser(req: NextRequest): Promise<ResolvedRequestUser> {
  const user = await requireResolvedUser(req);
  if (!user.principal.isAdmin) {
    logger.warn("catalog admin authorization denied", {
      correlationId: user.principal.correlationId,
      code: "not_admin",
      userId: user.id,
    });
    throw new AuthenticationError("not_admin", user.principal.correlationId);
  }
  return user;
}

type ResolveAdminUserResult =
  | { ok: true; user: ResolvedRequestUser }
  | { ok: false; response: NextResponse };

/**
 * Route-handler guard for catalog mutations. Returns the resolved admin user, or a
 * ready-to-return response using a NON-DISCLOSING contract:
 *   - 401 { error: 'Unauthorized' } for missing/invalid/wrong-principal auth
 *   - 403 { error: 'Forbidden' } for a resolved non-admin (or deactivated) account
 *
 * A non-admin gets the SAME coarse 403 the deactivated-account path returns, before any
 * resource lookup, so it never reveals whether a given catalog job exists.
 */
export async function resolveAdminUser(req: NextRequest): Promise<ResolveAdminUserResult> {
  try {
    return { ok: true, user: await requireAdminUser(req) };
  } catch (err) {
    if (err instanceof AuthenticationError) {
      if (err.code === "inactive_user" || err.code === "not_admin") {
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
