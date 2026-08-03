/** DB-002 legacy-owner backfill. Dry-run by default; pass --apply to write atomically. */
import { sql } from "drizzle-orm";
import { db } from "../src/db";
import { setUserContext } from "../src/db/session";

const APPLY = process.argv.includes("--apply");
const OVERLAY_TABLES = [
  "resume_versions",
  "user_skills",
  "user_software",
  "user_certifications",
  "user_keywords",
] as const;
type OverlayTable = (typeof OVERLAY_TABLES)[number];

function tableIdentifier(table: OverlayTable): ReturnType<typeof sql.raw> {
  if (!(OVERLAY_TABLES as readonly string[]).includes(table)) {
    throw new Error(`backfill: unsupported overlay table ${table}`);
  }
  return sql.raw(`"${table}"`);
}

async function scalar(query: ReturnType<typeof sql>): Promise<number> {
  const rows = await db.execute<{ n: number | string }>(query);
  return Number(rows[0]?.n ?? 0);
}

async function sourceCounts(): Promise<Record<string, number>> {
  const counts: Record<string, number> = {
    jobs: await scalar(sql`select count(*)::int n from jobs`),
    contacts: await scalar(sql`select count(*)::int n from contacts`),
    history: await scalar(sql`select count(*)::int n from job_status_history`),
  };
  for (const table of OVERLAY_TABLES) {
    counts[table] = await scalar(
      sql`select count(*)::int n from ${tableIdentifier(table)} where user_id is null`,
    );
  }
  return counts;
}

function printCounts(label: string, counts: Record<string, number>): void {
  console.log(`\n${label}`);
  for (const [name, count] of Object.entries(counts)) {
    console.log(`  ${name.padEnd(24)} ${count}`);
  }
}

async function main(): Promise<void> {
  const issuer = process.env.LEGACY_OWNER_ISSUER?.trim();
  const subject = process.env.LEGACY_OWNER_SUBJECT?.trim();
  const email = process.env.LEGACY_OWNER_EMAIL?.trim() || null;
  const displayName = process.env.LEGACY_OWNER_DISPLAY_NAME?.trim() || null;
  const before = await sourceCounts();
  printCounts("Legacy source rows / nullable owners before backfill:", before);

  if (!APPLY) {
    console.log(
      `\nDry run: no rows changed. Configured owner: ${issuer && subject ? `${issuer} / ${subject}` : "none"}.`,
    );
    console.log("Set LEGACY_OWNER_ISSUER and LEGACY_OWNER_SUBJECT, then pass --apply.");
    return;
  }
  if (!issuer || !subject) {
    throw new Error("--apply requires LEGACY_OWNER_ISSUER and LEGACY_OWNER_SUBJECT");
  }

  const report = await db.transaction(async (tx) => {
    const ownerRows = await tx.execute<{ id: number; is_active: boolean }>(sql`
      insert into users (issuer, subject, email, display_name)
      values (${issuer}, ${subject}, ${email}, ${displayName})
      on conflict (issuer, subject) do update set
        email = coalesce(excluded.email, users.email),
        display_name = coalesce(excluded.display_name, users.display_name),
        updated_at = now()
      returning id, is_active
    `);
    const owner = ownerRows[0];
    if (!owner || !Number.isInteger(Number(owner.id))) {
      throw new Error("backfill: legacy owner upsert returned no valid id");
    }
    const ownerId = Number(owner.id);
    await setUserContext(tx, ownerId);

    for (const table of OVERLAY_TABLES) {
      await tx.execute(
        sql`update ${tableIdentifier(table)} set user_id = ${ownerId} where user_id is null`,
      );
    }

    await tx.execute(sql`
      insert into user_job_state (
        user_id, job_id, priority, has_applied, date_applied, heard_back,
        interview_stage, referral, cover_letter_submitted, resume_version_id,
        rejection_reason, notes, created_at, updated_at
      )
      select ${ownerId}, j.id, j.priority, j.has_applied, j.date_applied, j.heard_back,
        coalesce(j.interview_stage, 'not_applied'::interview_stage_enum), j.referral,
        j.cover_letter_submitted, rv.id, j.rejection_reason, j.notes,
        j.created_at, j.updated_at
      from jobs j
      left join resume_versions rv
        on rv.user_id = ${ownerId} and rv.label = j.resume_version
      on conflict (user_id, job_id) do nothing
    `);
    await tx.execute(sql`
      insert into user_job_contacts (
        id, user_id, job_id, name, title, email, phone, linkedin_url,
        role, contacted_at, notes, created_at
      )
      select id, ${ownerId}, job_id, name, title, email, phone, linkedin_url,
        role, contacted_at, notes, created_at from contacts
      on conflict (id) do nothing
    `);
    await tx.execute(sql`
      insert into user_job_status_history (id, user_id, job_id, from_stage, to_stage, changed_at)
      select id, ${ownerId}, job_id, from_stage, to_stage, changed_at from job_status_history
      on conflict (id) do nothing
    `);
    await tx.execute(sql`select setval(pg_get_serial_sequence('user_job_contacts', 'id'), coalesce((select max(id) from user_job_contacts), 1), exists(select 1 from user_job_contacts))`);
    await tx.execute(sql`select setval(pg_get_serial_sequence('user_job_status_history', 'id'), coalesce((select max(id) from user_job_status_history), 1), exists(select 1 from user_job_status_history))`);

    const destination = {
      jobs: Number((await tx.execute<{ n: number }>(sql`select count(*)::int n from user_job_state where user_id = ${ownerId}`))[0]?.n ?? 0),
      contacts: Number((await tx.execute<{ n: number }>(sql`select count(*)::int n from user_job_contacts where user_id = ${ownerId}`))[0]?.n ?? 0),
      history: Number((await tx.execute<{ n: number }>(sql`select count(*)::int n from user_job_status_history where user_id = ${ownerId}`))[0]?.n ?? 0),
    };
    const integrity = {
      stateParity: Number((await tx.execute<{ n: number }>(sql`
        select count(*)::int n from jobs j join user_job_state s
          on s.user_id = ${ownerId} and s.job_id = j.id
        left join resume_versions rv
          on rv.user_id = ${ownerId} and rv.label = j.resume_version
        where s.priority is distinct from j.priority
           or s.has_applied is distinct from j.has_applied
           or s.date_applied is distinct from j.date_applied
           or s.heard_back is distinct from j.heard_back
           or s.interview_stage is distinct from coalesce(j.interview_stage, 'not_applied'::interview_stage_enum)
           or s.referral is distinct from j.referral
           or s.cover_letter_submitted is distinct from j.cover_letter_submitted
           or s.resume_version_id is distinct from rv.id
           or s.rejection_reason is distinct from j.rejection_reason
           or s.notes is distinct from j.notes
      `))[0]?.n ?? 0),
      orphanChildren: Number((await tx.execute<{ n: number }>(sql`
        select (select count(*) from user_job_contacts c left join user_job_state s
                  on (s.user_id, s.job_id) = (c.user_id, c.job_id) where s.job_id is null)
             + (select count(*) from user_job_status_history h left join user_job_state s
                  on (s.user_id, s.job_id) = (h.user_id, h.job_id) where s.job_id is null) as n
      `))[0]?.n ?? 0),
      crossOwnerChildren: Number((await tx.execute<{ n: number }>(sql`
        select (select count(*) from user_job_contacts c join user_job_state s
                  on s.job_id = c.job_id and s.user_id <> c.user_id
                  where not exists (select 1 from user_job_state own
                    where (own.user_id, own.job_id) = (c.user_id, c.job_id)))
             + (select count(*) from user_job_status_history h join user_job_state s
                  on s.job_id = h.job_id and s.user_id <> h.user_id
                  where not exists (select 1 from user_job_state own
                    where (own.user_id, own.job_id) = (h.user_id, h.job_id))) as n
      `))[0]?.n ?? 0),
    };
    const remainingUnowned: Record<string, number> = {};
    for (const table of OVERLAY_TABLES) {
      const rows = await tx.execute<{ n: number }>(
        sql`select count(*)::int n from ${tableIdentifier(table)} where user_id is null`,
      );
      remainingUnowned[table] = Number(rows[0]?.n ?? 0);
    }

    const failed = destination.jobs !== before.jobs ||
      destination.contacts !== before.contacts || destination.history !== before.history ||
      integrity.stateParity !== 0 || integrity.orphanChildren !== 0 ||
      integrity.crossOwnerChildren !== 0 || Object.values(remainingUnowned).some((n) => n !== 0);
    if (failed) {
      throw new Error(`backfill verification failed: ${JSON.stringify({ destination, integrity, remainingUnowned })}`);
    }
    return { ownerId, ownerActive: owner.is_active, destination, integrity, remainingUnowned };
  });

  console.log(`\nApplied for legacy owner id ${report.ownerId} (active=${report.ownerActive}).`);
  printCounts("Destination rows after backfill:", report.destination);
  console.log(`Integrity: ${JSON.stringify(report.integrity)}; remaining unowned: ${JSON.stringify(report.remainingUnowned)}`);
  console.log("Verify OK. Re-running is safe and preserves existing destination rows.");
}

main().catch((error) => {
  console.error("backfill-user-ownership failed:", error);
  process.exit(1);
});
