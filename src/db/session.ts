import { sql } from "drizzle-orm";
import { db } from "./index";

/**
 * DB-002 — per-request owner context for PostgreSQL Row-Level Security.
 *
 * The RLS policies added in migration 0009 (`user_job_state` and its private children,
 * to the other owner-scoped tables in SEC-001) match rows against the `app.user_id`
 * GUC. `set_config(name, value, is_local => true)` scopes the value to the current
 * transaction, so it is automatically reset on COMMIT/ROLLBACK and never leaks across
 * pooled connections.
 *
 * IMPORTANT: RLS here is defense in depth only. Application code must still apply
 * explicit owner predicates (ADR-005); this context is a second barrier, not a
 * substitute for owner-scoped queries.
 */

// Structural type for "something with a drizzle-style .execute()": the shared `db` or
// an open transaction. Keeps setUserContext usable from scripts/tests without pulling
// in the concrete transaction generic.
export type SqlExecutor = { execute: (query: ReturnType<typeof sql>) => Promise<unknown> };

/**
 * Set the owner context on an already-open transaction. Call this before touching any
 * RLS-protected table inside the transaction. `userId` is coerced to a string because
 * GUC values are text; the RLS policy casts it back with `::int`.
 */
export async function setUserContext(tx: SqlExecutor, userId: number): Promise<void> {
  if (!Number.isInteger(userId) || userId <= 0) {
    throw new Error(`setUserContext: invalid userId ${userId}`);
  }
  await tx.execute(sql`select set_config('app.user_id', ${String(userId)}, true)`);
}

/**
 * Run `fn` inside a transaction that has the owner context set, so RLS-protected
 * tables are visible/writable for exactly this user:
 *
 *   const rows = await withUser(user.id, (tx) =>
 *     tx.select().from(userJobState)  // only this user's rows
 *   )
 */
export function withUser<T>(
  userId: number,
  fn: (tx: Parameters<Parameters<typeof db.transaction>[0]>[0]) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await setUserContext(tx, userId);
    return fn(tx);
  });
}
