import { sql } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";

/**
 * DB-002 — internal-user persistence adapter.
 *
 * AUTH-003 verifies a token and produces a normalized `(issuer, subject)` identity but
 * deliberately does NOT persist it; this module converts that verified external
 * identity into a stable internal `users.id` used by every owner-scoped relationship.
 *
 * Security contract:
 *  - The ONLY identity key is the verified, normalized `(issuer, subject)` pair. Email
 *    and display name are mutable presentation metadata and are never used to look up
 *    or match a user — an email change must not create or collide with an identity.
 *  - Callers pass identity values that came from a verified principal. A user id from a
 *    URL, request body, query string, header, extension storage, or scraper config is
 *    never accepted here.
 *  - Upsert refreshes metadata but never reactivates a deactivated account: `is_active`
 *    is intentionally left out of the conflict update so deactivation fails closed.
 */

export type ResolvableIdentity = {
  /** Normalized issuer (AUTH-003 normalizes trailing slashes before this point). */
  issuer: string;
  /** Immutable OIDC subject within the issuer; must be non-empty. */
  subject: string;
  email?: string | null;
  displayName?: string | null;
};

export type ResolvedUser = {
  id: number;
  issuer: string;
  subject: string;
  email: string | null;
  displayName: string | null;
  isActive: boolean;
};

/**
 * Resolve (creating on first sight) the internal user for a verified identity.
 *
 * Uses a single `INSERT ... ON CONFLICT (issuer, subject) DO UPDATE` so concurrent
 * first-logins for the same subject resolve to one row without a read-then-write race.
 * Returns the row including `is_active`; the caller is responsible for rejecting an
 * inactive user — this adapter never makes an authorization decision.
 */
export async function resolveUser(identity: ResolvableIdentity): Promise<ResolvedUser> {
  const issuer = identity.issuer?.trim();
  const subject = identity.subject?.trim();
  if (!issuer) throw new Error("resolveUser: issuer is required");
  if (!subject) throw new Error("resolveUser: subject is required");

  const email = normalizeMetadata(identity.email);
  const displayName = normalizeMetadata(identity.displayName);

  const [row] = await db
    .insert(users)
    .values({ issuer, subject, email, displayName })
    .onConflictDoUpdate({
      target: [users.issuer, users.subject],
      set: {
        // coalesce(excluded, existing): refresh metadata when the token carries it,
        // but never wipe a stored value just because this token omitted it. `is_active`
        // is intentionally NOT updated here (deactivation must not self-heal on login).
        email: sql`coalesce(excluded.email, ${users.email})`,
        displayName: sql`coalesce(excluded.display_name, ${users.displayName})`,
        updatedAt: sql`now()`,
      },
    })
    .returning({
      id: users.id,
      issuer: users.issuer,
      subject: users.subject,
      email: users.email,
      displayName: users.displayName,
      isActive: users.isActive,
    });

  return row;
}

/** Trim metadata and collapse empty strings to null so blanks aren't stored. */
function normalizeMetadata(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}
