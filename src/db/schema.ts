import {
  pgTable,
  pgEnum,
  serial,
  text,
  boolean,
  integer,
  smallint,
  numeric,
  char,
  date,
  timestamp,
  uniqueIndex,
  index,
  primaryKey,
  foreignKey,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { sourcePlatformValues } from "@/lib/source-platforms";
import {
  interviewStageValues,
  jobTypeValues,
  experienceLevelValues,
  companySizeValues,
  salaryTypeValues,
  softwareFamiliarityValues,
  keywordPreferenceValues,
} from "@/lib/enums";

// ── ENUMs ────────────────────────────────────────────────────────────────────
// Value tuples are single-sourced from @/lib/enums (and @/lib/source-platforms)
// so the DB schema, Zod validation, and UI menus can't drift apart.

export const interviewStageEnum = pgEnum("interview_stage_enum", interviewStageValues);

export const sourcePlatformEnum = pgEnum("source_platform_enum", sourcePlatformValues);

export const jobTypeEnum = pgEnum("job_type_enum", jobTypeValues);

export const experienceLevelEnum = pgEnum("experience_level_enum", experienceLevelValues);

export const companySizeEnum = pgEnum("company_size_enum", companySizeValues);

// "annual" → salary_min/salary_max (integer cents)
// "hourly" → hourly_rate_min/hourly_rate_max (numeric dollars)
export const salaryTypeEnum = pgEnum("salary_type_enum", salaryTypeValues);

// ── users ────────────────────────────────────────────────────────────────────
// DB-002: internal authorization principal for one authenticated human user.
// Identity is the verified, normalized Authentik (issuer, subject) pair supplied by
// AUTH-003 — never email, display name, headers, or a caller-supplied id. `email` and
// `display_name` are mutable presentation metadata, never lookup keys.
//
// Ownership model (see Architecture Decision Register ADR-018): jobs and companies
// stay GLOBAL/canonical (no user_id); per-user state lives in owner-scoped overlay
// tables (user_job_state and its children) and owner-scoped taxonomy/resume associations.
// Admin write access to the shared catalog is decided at the auth layer from an OIDC
// group/scope claim; it is deliberately NOT stored here as an authorization source.

export const users = pgTable(
  "users",
  {
    id: serial("id").primaryKey(),
    issuer: text("issuer").notNull(),
    subject: text("subject").notNull(),
    email: text("email"),
    displayName: text("display_name"),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    // The normalized (issuer, subject) pair is the ONLY stable identity key and the
    // conflict target for the transactional upsert in src/lib/users.ts.
    uniqueIndex("users_issuer_subject_uq").on(t.issuer, t.subject),
  ],
);

// ── companies ────────────────────────────────────────────────────────────────

export const companies = pgTable("companies", {
  id: serial("id").primaryKey(),
  // Also has a pg_trgm GIN index (companies_name_trgm_idx, see
  // migrations/0004_add_search_trgm_indexes.sql) backing the /api/jobs `q` search.
  name: text("name").unique().notNull(),
  website: text("website"),
  industry: text("industry"),
  sizeRange: companySizeEnum("size_range"),
  hqLocation: text("hq_location"),
  glassdoorUrl: text("glassdoor_url"),
  linkedinUrl: text("linkedin_url"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// ── jobs ─────────────────────────────────────────────────────────────────────

export const jobs = pgTable(
  "jobs",
  {
    id: serial("id").primaryKey(),
    companyId: integer("company_id").references(() => companies.id, { onDelete: "set null" }),
    jobTitle: text("job_title").notNull(),
    jobLink: text("job_link"),
    jobLocation: text("job_location"),
    isRemote: boolean("is_remote").default(false).notNull(),
    sourcePlatform: sourcePlatformEnum("source_platform"),
    externalJobId: text("external_job_id"),
    jobType: jobTypeEnum("job_type"),
    experienceLevel: experienceLevelEnum("experience_level"),
    jobDescription: text("job_description"),
    // Salary — raw fields depend on salary_type:
    //   annual → salary_min / salary_max (integer cents, e.g. $80k = 8_000_000)
    //   hourly → hourly_rate_min / hourly_rate_max (numeric dollars, e.g. 45.50)
    // annual_equivalent_* is always populated on ingest for unified filtering/analytics:
    //   annual jobs: copy of salary_min / salary_max
    //   hourly jobs: hourly_rate × 2080 × 100
    salaryType: salaryTypeEnum("salary_type"),
    salaryMin: integer("salary_min"),
    salaryMax: integer("salary_max"),
    hourlyRateMin: numeric("hourly_rate_min", { precision: 10, scale: 2 }),
    hourlyRateMax: numeric("hourly_rate_max", { precision: 10, scale: 2 }),
    annualEquivalentMin: integer("annual_equivalent_min"),
    annualEquivalentMax: integer("annual_equivalent_max"),
    salaryText: text("salary_text"),
    // NOTE: not `.notNull()` yet — the salary PATCH route (jobs/[id]/salary,
    // owned by TECHDEBT-001) intentionally accepts `salary_currency: null` to
    // clear the field. Tightening this to NOT NULL requires coordinating that
    // route's schema first; deferred to avoid touching route handlers here.
    salaryCurrency: char("salary_currency", { length: 3 }).default("USD"),
    hasApplied: boolean("has_applied").default(false).notNull(),
    dateApplied: date("date_applied"),
    heardBack: boolean("heard_back").default(false).notNull(),
    interviewStage: interviewStageEnum("interview_stage").default("not_applied"),
    datePosted: date("date_posted"),
    dateFound: date("date_found"),
    lastScrapedAt: timestamp("last_scraped_at", { withTimezone: true }),
    isActive: boolean("is_active").default(true).notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    applicationDeadline: date("application_deadline"),
    postingMdPath: text("posting_md_path"),
    securityClearanceReq: boolean("security_clearance_req").default(false).notNull(),
    priority: smallint("priority"), // 1–5
    referral: boolean("referral").default(false).notNull(),
    coverLetterSubmitted: boolean("cover_letter_submitted").default(false).notNull(),
    resumeVersion: text("resume_version"),
    rejectionReason: text("rejection_reason"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    // Partial unique index: only scraped jobs (external_job_id set) participate in
    // dedup. Manually-created jobs always have external_job_id NULL and must not
    // collide with each other — a plain UNIQUE NULLS NOT DISTINCT constraint would
    // treat every (NULL, NULL) row as a duplicate of the first.
    uniqueIndex("jobs_external_dedup")
      .on(t.externalJobId, t.sourcePlatform)
      .where(sql`${t.externalJobId} IS NOT NULL`),
    index("jobs_company_id_idx").on(t.companyId),
    index("jobs_interview_stage_idx").on(t.interviewStage),
    index("jobs_date_found_idx").on(t.dateFound),
    index("jobs_is_active_idx").on(t.isActive),
    index("jobs_source_platform_idx").on(t.sourcePlatform),
    index("jobs_priority_idx").on(t.priority),
    index("jobs_last_scraped_at_idx").on(t.lastScrapedAt),
    // Push business rules that previously lived only in Zod down into the DB.
    check("jobs_priority_range_check", sql`${t.priority} IS NULL OR ${t.priority} BETWEEN 1 AND 5`),
    check(
      "jobs_salary_min_max_check",
      sql`${t.salaryMin} IS NULL OR ${t.salaryMax} IS NULL OR ${t.salaryMin} <= ${t.salaryMax}`,
    ),
    // GIN full-text index must be added as a raw SQL migration — Drizzle doesn't
    // support functional indexes. After `npm run db:generate`, append this to the
    // generated migration file:
    //   CREATE INDEX jobs_description_search_idx ON jobs
    //   USING GIN (to_tsvector('english', coalesce(job_description, '')));
    //
    // jobs.job_title also has a pg_trgm GIN index (jobs_job_title_trgm_idx, see
    // migrations/0004_add_search_trgm_indexes.sql) so the ilike() branch in the
    // /api/jobs `q` search is index-backed alongside the description tsvector match.
  ]
);

// ── user_job_state ────────────────────────────────────────────────────────────
// Sparse private state for one user tracking one shared catalog job. Application
// fields remain on jobs only as a legacy EXPAND-phase read source until API-013.

export const userJobState = pgTable(
  "user_job_state",
  {
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    jobId: integer("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    priority: smallint("priority"),
    isHidden: boolean("is_hidden").default(false).notNull(),
    hasApplied: boolean("has_applied").default(false).notNull(),
    dateApplied: date("date_applied"),
    heardBack: boolean("heard_back").default(false).notNull(),
    interviewStage: interviewStageEnum("interview_stage").default("not_applied").notNull(),
    referral: boolean("referral").default(false).notNull(),
    coverLetterSubmitted: boolean("cover_letter_submitted").default(false).notNull(),
    resumeVersionId: integer("resume_version_id"),
    rejectionReason: text("rejection_reason"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    // Owner-first composite PK also indexes the (user_id) owner-scoped access path.
    primaryKey({ columns: [t.userId, t.jobId] }),
    index("user_job_state_job_id_idx").on(t.jobId),
    index("user_job_state_user_stage_idx").on(t.userId, t.interviewStage),
    index("user_job_state_user_applied_idx").on(t.userId, t.hasApplied),
    index("user_job_state_user_priority_idx").on(t.userId, t.priority),
    index("user_job_state_resume_version_id_idx").on(t.resumeVersionId),
    // In the DB this FK is `ON DELETE SET NULL (resume_version_id)` (migration 0010): a
    // deleted resume nulls only the reference, and — being a referential action — bypasses
    // RLS, so deletion works without route-level `app.user_id` context. Drizzle cannot
    // express the column-targeted action (a plain `.onDelete("set null")` would also null
    // `user_id`, which is NOT NULL / part of the PK), so it stays hand-written in SQL and
    // invisible to `db:generate` diffing, like the triggers/RLS in 0008/0009.
    foreignKey({
      columns: [t.userId, t.resumeVersionId],
      foreignColumns: [resumeVersions.userId, resumeVersions.id],
      name: "user_job_state_owner_resume_fk",
    }),
    check(
      "user_job_state_priority_range_check",
      sql`${t.priority} IS NULL OR ${t.priority} BETWEEN 1 AND 5`,
    ),
  ],
);

export const userJobContacts = pgTable(
  "user_job_contacts",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    jobId: integer("job_id").notNull().references(() => jobs.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    title: text("title"),
    email: text("email"),
    phone: text("phone"),
    linkedinUrl: text("linkedin_url"),
    role: text("role"),
    contactedAt: date("contacted_at"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [
    index("user_job_contacts_user_job_idx").on(t.userId, t.jobId),
    index("user_job_contacts_job_id_idx").on(t.jobId),
    foreignKey({
      columns: [t.userId, t.jobId],
      foreignColumns: [userJobState.userId, userJobState.jobId],
      name: "user_job_contacts_state_fk",
    }).onDelete("cascade"),
  ],
);

export const userJobStatusHistory = pgTable(
  "user_job_status_history",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    jobId: integer("job_id").notNull().references(() => jobs.id, { onDelete: "cascade" }),
    fromStage: interviewStageEnum("from_stage"),
    toStage: interviewStageEnum("to_stage").notNull(),
    changedAt: timestamp("changed_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("user_job_status_history_user_job_changed_idx").on(t.userId, t.jobId, t.changedAt),
    index("user_job_status_history_job_id_idx").on(t.jobId),
    foreignKey({
      columns: [t.userId, t.jobId],
      foreignColumns: [userJobState.userId, userJobState.jobId],
      name: "user_job_status_history_state_fk",
    }).onDelete("cascade"),
  ],
);

export const resumeVersions = pgTable(
  "resume_versions",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    filePath: text("file_path"),
    date: date("date"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [
    index("resume_versions_user_id_idx").on(t.userId),
    uniqueIndex("resume_versions_user_id_id_uq").on(t.userId, t.id),
    uniqueIndex("resume_versions_user_id_label_uq").on(t.userId, t.label),
  ],
);

// ── Lookup tables ─────────────────────────────────────────────────────────────

export const skills = pgTable("skills", {
  id: serial("id").primaryKey(),
  name: text("name").unique().notNull(),
});

export const software = pgTable("software", {
  id: serial("id").primaryKey(),
  name: text("name").unique().notNull(),
});

export const keywords = pgTable("keywords", {
  id: serial("id").primaryKey(),
  name: text("name").unique().notNull(),
});

export const certifications = pgTable("certifications", {
  id: serial("id").primaryKey(),
  name: text("name").unique().notNull(),
});

// ── Junction tables ───────────────────────────────────────────────────────────

export const jobSkills = pgTable(
  "job_skills",
  {
    jobId: integer("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    skillId: integer("skill_id")
      .notNull()
      .references(() => skills.id, { onDelete: "cascade" }),
    isRequired: boolean("is_required").default(true),
  },
  (t) => [primaryKey({ columns: [t.jobId, t.skillId] })]
);

export const jobSoftware = pgTable(
  "job_software",
  {
    jobId: integer("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    softwareId: integer("software_id")
      .notNull()
      .references(() => software.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.jobId, t.softwareId] })]
);

export const jobKeywords = pgTable(
  "job_keywords",
  {
    jobId: integer("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    keywordId: integer("keyword_id")
      .notNull()
      .references(() => keywords.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.jobId, t.keywordId] })]
);

export const jobCertifications = pgTable(
  "job_certifications",
  {
    jobId: integer("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    certificationId: integer("certification_id")
      .notNull()
      .references(() => certifications.id, { onDelete: "cascade" }),
    isRequired: boolean("is_required").default(true),
  },
  (t) => [primaryKey({ columns: [t.jobId, t.certificationId] })]
);

// ── user_skills ───────────────────────────────────────────────────────────────
// One row per skill in the skills table. User toggles has_skill in Settings.
// Match % per job = COUNT(job_skills where skill in user_skills where has_skill=true and is_required=true)
//                 / COUNT(job_skills where is_required=true)

export const userSkills = pgTable(
  "user_skills",
  {
    // API-014 CONTRACT phase: the legacy-owner backfill must complete before this
    // owner column becomes required and the key becomes (user_id, skill_id).
    userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    skillId: integer("skill_id")
      .notNull()
      .references(() => skills.id, { onDelete: "cascade" }),
    hasSkill: boolean("has_skill").default(false).notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.skillId] }), index("user_skills_user_id_idx").on(t.userId)]
);

export const softwareFamiliarityEnum = pgEnum(
  "software_familiarity_enum",
  softwareFamiliarityValues,
);

export const keywordPreferenceEnum = pgEnum("keyword_preference_enum", keywordPreferenceValues);

export const userSoftware = pgTable(
  "user_software",
  {
    // API-014 CONTRACT phase — see the note on userSkills.userId.
    userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    softwareId: integer("software_id")
      .notNull()
      .references(() => software.id, { onDelete: "cascade" }),
    familiarity: softwareFamiliarityEnum("familiarity"),
  },
  (t) => [primaryKey({ columns: [t.userId, t.softwareId] }), index("user_software_user_id_idx").on(t.userId)],
);

export const userCertifications = pgTable(
  "user_certifications",
  {
    // API-014 CONTRACT phase — see the note on userSkills.userId.
    userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    certificationId: integer("certification_id")
      .notNull()
      .references(() => certifications.id, { onDelete: "cascade" }),
    issuer: text("issuer"),
    earnedDate: date("earned_date"),
    expiresAt: date("expires_at"),
    credentialUrl: text("credential_url"),
  },
  (t) => [
    check(
      "user_certifications_dates_check",
      sql`${t.earnedDate} IS NULL OR ${t.expiresAt} IS NULL OR ${t.expiresAt} >= ${t.earnedDate}`,
    ),
    index("user_certifications_user_id_idx").on(t.userId),
    primaryKey({ columns: [t.userId, t.certificationId] }),
  ],
);

export const userKeywords = pgTable(
  "user_keywords",
  {
    // API-014 CONTRACT phase — see the note on userSkills.userId.
    userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    keywordId: integer("keyword_id")
      .notNull()
      .references(() => keywords.id, { onDelete: "cascade" }),
    preference: keywordPreferenceEnum("preference").default("interest").notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.keywordId] }), index("user_keywords_user_id_idx").on(t.userId)],
);

// ── job_status_history ────────────────────────────────────────────────────────
// Written every time interview_stage changes. Powers the recent activity feed.

export const jobStatusHistory = pgTable(
  "job_status_history",
  {
    id: serial("id").primaryKey(),
    jobId: integer("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    fromStage: interviewStageEnum("from_stage"),
    toStage: interviewStageEnum("to_stage").notNull(),
    changedAt: timestamp("changed_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [index("job_status_history_job_id_idx").on(t.jobId)],
);

// ── contacts ──────────────────────────────────────────────────────────────────

export const contacts = pgTable(
  "contacts",
  {
    id: serial("id").primaryKey(),
    jobId: integer("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    title: text("title"),
    email: text("email"),
    phone: text("phone"),
    linkedinUrl: text("linkedin_url"),
    role: text("role"),
    contactedAt: date("contacted_at"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [index("contacts_job_id_idx").on(t.jobId)],
);
