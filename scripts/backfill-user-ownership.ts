/**
 * DB-002 — backfill + verify phase of the multi-user ownership rollout.
 *
 * Assigns every pre-existing owner-scoped row (created in the single-user era) to an
 * explicitly configured LEGACY OWNER, and seeds the per-user job-priority overlay from
 * the canonical `jobs.priority`. This is the "backfill" and "verify" step between the
 * additive EXPAND migration (0008) and the future CONTRACT migration that flips
 * `user_id` to NOT NULL — see the DB-002 task note.
 *
 * SAFETY (follows ADR-017 "forward-only, dry-run-first data evolution"):
 *  - Dry run by DEFAULT. It only writes when invoked with `--apply`.
 *  - Requires an explicit legacy owner identity; refuses to run without one, so the
 *    legacy assignment is a deliberate, auditable decision, not a silent default.
 *  - All writes run inside a single transaction.
 *  - Idempotent: re-running only touches rows still lacking an owner (user_id IS NULL)
 *    and uses ON CONFLICT DO NOTHING for the priority overlay.
 *  - Prints pre/post NULL-owner counts and an orphan check for every affected table.
 *
 * ENV (needs DATABASE_URL, plus the legacy owner identity):
 *   LEGACY_OWNER_ISSUER    normalized Authentik issuer of the legacy owner (required)
 *   LEGACY_OWNER_SUBJECT   OIDC subject of the legacy owner (required)
 *   LEGACY_OWNER_EMAIL         optional display metadata
 *   LEGACY_OWNER_DISPLAY_NAME  optional display metadata
 *
 * USAGE:
 *   npm run db:backfill-ownership            # dry run — prints the report only
 *   npm run db:backfill-ownership -- --apply # writes the changes
 */
import { sql } from "drizzle-orm";
// Relative imports (not the `@/` alias) so the script runs under plain `tsx`.
import { db } from "../src/db";
import { setUserContext } from "../src/db/session";

const APPLY = process.argv.includes("--apply");

// Owner-scoped tables that gained a nullable `user_id` in migration 0008 and must be
// backfilled before the CONTRACT phase can enforce NOT NULL. Names are hard-coded
// constants (never user input), so interpolating them into SQL is safe.
const OVERLAY_TABLES = [
  "resume_versions",
  "user_skills",
  "user_software",
  "user_certifications",
  "user_keywords",
] as const;
type OverlayTable = (typeof OVERLAY_TABLES)[number];

function overlayTableIdentifier(table: OverlayTable): ReturnType<typeof sql.raw> {
  if (!(OVERLAY_TABLES as readonly string[]).includes(table)) {
    throw new Error(`backfill: unsupported overlay table ${table}`);
  }
  return sql.raw(`"${table}"`);
}

async function scalar(query: ReturnType<typeof sql>): Promise<number> {
  const rows = await db.execute<{ n: number | string }>(query);
  return Number(rows[0]?.n ?? 0);
}

async function nullOwnerCount(table: OverlayTable): Promise<number> {
  return scalar(
    sql`select count(*)::int as n from ${overlayTableIdentifier(table)} where user_id is null`,
  );
}

async function main(): Promise<void> {
  const issuer = process.env.LEGACY_OWNER_ISSUER?.trim();
  const subject = process.env.LEGACY_OWNER_SUBJECT?.trim();
  const email = process.env.LEGACY_OWNER_EMAIL?.trim() || null;
  const displayName = process.env.LEGACY_OWNER_DISPLAY_NAME?.trim() || null;

  if (!issuer || !subject) {
    console.error(
      "Refusing to run: set LEGACY_OWNER_ISSUER and LEGACY_OWNER_SUBJECT to the " +
        "explicit legacy owner identity before backfilling ownership.",
    );
    process.exit(1);
  }

  // ── Pre-counts (the "before" half of the verify report) ──────────────────────
  const before: Record<string, number> = {};
  for (const table of OVERLAY_TABLES) before[table] = await nullOwnerCount(table);
  const jobsWithPriority = await scalar(
    sql`select count(*)::int as n from jobs where priority is not null`,
  );
  const existingPriorityRows = await scalar(
    sql`select count(*)::int as n from user_job_priority`,
  );

  console.log(`Legacy owner: issuer=${issuer} subject=${subject}`);
  console.log("\nRows lacking an owner (user_id IS NULL) before backfill:");
  for (const table of OVERLAY_TABLES) console.log(`  ${table.padEnd(20)} ${before[table]}`);
  console.log(
    `\nuser_job_priority: ${existingPriorityRows} existing row(s); ` +
      `${jobsWithPriority} job(s) carry a canonical priority to seed.`,
  );

  if (!APPLY) {
    console.log(
      "\nDry run — no rows changed. Re-run with `-- --apply` to write the backfill.",
    );
    process.exit(0);
  }

  // ── Apply, atomically ────────────────────────────────────────────────────────
  await db.transaction(async (tx) => {
    // Upsert the legacy owner. Keyed only on (issuer, subject); metadata is refreshed
    // without wiping existing values and without reactivating a disabled account.
    const inserted = await tx.execute<{ id: number }>(sql`
      insert into users (issuer, subject, email, display_name)
      values (${issuer}, ${subject}, ${email}, ${displayName})
      on conflict (issuer, subject) do update
        set email = coalesce(excluded.email, users.email),
            display_name = coalesce(excluded.display_name, users.display_name),
            updated_at = now()
      returning id
    `);
    const insertedOwner = inserted[0];
    if (!insertedOwner) {
      throw new Error("backfill: legacy owner upsert returned no row");
    }
    const ownerId = Number(insertedOwner.id);
    if (!Number.isInteger(ownerId) || ownerId <= 0) {
      throw new Error(`backfill: unexpected legacy owner id ${insertedOwner.id}`);
    }

    // Owner context so the RLS-protected user_job_priority insert is permitted even
    // under a non-superuser application role (migration 0009).
    await setUserContext(tx, ownerId);

    for (const table of OVERLAY_TABLES) {
      await tx.execute(
        sql`update ${overlayTableIdentifier(table)} set user_id = ${ownerId} where user_id is null`,
      );
    }

    await tx.execute(sql`
      insert into user_job_priority (user_id, job_id, priority)
      select ${ownerId}, id, priority from jobs where priority is not null
      on conflict (user_id, job_id) do nothing
    `);

    console.log(`\nApplied backfill for owner id ${ownerId}.`);
  });

  // ── Post-counts + orphan checks (the "after" half of verify) ─────────────────
  console.log("\nRows lacking an owner (user_id IS NULL) after backfill:");
  let anyRemaining = false;
  for (const table of OVERLAY_TABLES) {
    const remaining = await nullOwnerCount(table);
    if (remaining > 0) anyRemaining = true;
    console.log(`  ${table.padEnd(20)} ${remaining}${remaining > 0 ? "  ⚠️ STILL UNOWNED" : ""}`);
  }

  // Orphan check: any overlay row whose user_id points at a non-existent user. The FK
  // makes this structurally impossible, but the check is cheap and proves it post hoc.
  let orphans = 0;
  for (const table of OVERLAY_TABLES) {
    orphans += await scalar(
      sql`select count(*)::int as n from ${overlayTableIdentifier(table)} t
          where t.user_id is not null and not exists
            (select 1 from users u where u.id = t.user_id)`,
    );
  }
  const priorityRows = await scalar(sql`select count(*)::int as n from user_job_priority`);
  console.log(`\nuser_job_priority now holds ${priorityRows} row(s). Orphaned owners: ${orphans}.`);

  if (anyRemaining || orphans > 0) {
    console.error("\nVerify FAILED: unowned rows or orphaned owners remain. Do NOT run CONTRACT.");
    process.exit(1);
  }
  console.log("\nVerify OK: every owner-scoped row has a valid owner. Safe to plan CONTRACT.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("backfill-user-ownership failed:", err);
    process.exit(1);
  });
