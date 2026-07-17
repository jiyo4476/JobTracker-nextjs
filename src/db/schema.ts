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
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { sourcePlatformValues } from "@/lib/source-platforms";

// ── ENUMs ────────────────────────────────────────────────────────────────────

export const interviewStageEnum = pgEnum("interview_stage_enum", [
  "not_applied",
  "applied",
  "phone_screen",
  "technical_screen",
  "onsite",
  "offer_received",
  "rejected",
  "withdrawn",
]);

export const sourcePlatformEnum = pgEnum("source_platform_enum", sourcePlatformValues);

export const jobTypeEnum = pgEnum("job_type_enum", [
  "full_time",
  "part_time",
  "contract",
  "internship",
  "temp",
  "freelance",
]);

export const experienceLevelEnum = pgEnum("experience_level_enum", [
  "entry",
  "mid",
  "senior",
  "lead",
  "executive",
]);

export const companySizeEnum = pgEnum("company_size_enum", [
  "1-10",
  "11-50",
  "51-200",
  "201-500",
  "501-1000",
  "1001-5000",
  "5000+",
]);

// "annual" → salary_min/salary_max (integer cents)
// "hourly" → hourly_rate_min/hourly_rate_max (numeric dollars)
export const salaryTypeEnum = pgEnum("salary_type_enum", ["annual", "hourly"]);

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
    isRemote: boolean("is_remote").default(false),
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
    salaryCurrency: char("salary_currency", { length: 3 }).default("USD"),
    hasApplied: boolean("has_applied").default(false),
    dateApplied: date("date_applied"),
    heardBack: boolean("heard_back").default(false),
    interviewStage: interviewStageEnum("interview_stage").default("not_applied"),
    datePosted: date("date_posted"),
    dateFound: date("date_found"),
    lastScrapedAt: timestamp("last_scraped_at", { withTimezone: true }),
    isActive: boolean("is_active").default(true),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    applicationDeadline: date("application_deadline"),
    postingMdPath: text("posting_md_path"),
    securityClearanceReq: boolean("security_clearance_req").default(false),
    priority: smallint("priority"), // 1–5
    referral: boolean("referral").default(false),
    coverLetterSubmitted: boolean("cover_letter_submitted").default(false),
    resumeVersion: text("resume_version"),
    rejectionReason: text("rejection_reason"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
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
    // GIN full-text index must be added as a raw SQL migration — Drizzle doesn't
    // support functional indexes. After `npm run db:generate`, append this to the
    // generated migration file:
    //   CREATE INDEX jobs_description_fts_idx ON jobs
    //   USING GIN (to_tsvector('english', coalesce(job_description, '')));
    //
    // jobs.job_title also has a pg_trgm GIN index (jobs_job_title_trgm_idx, see
    // migrations/0004_add_search_trgm_indexes.sql) so the ilike() branch in the
    // /api/jobs `q` search is index-backed alongside the description tsvector match.
  ]
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
    skillId: integer("skill_id")
      .notNull()
      .references(() => skills.id, { onDelete: "cascade" }),
    hasSkill: boolean("has_skill").default(false).notNull(),
  },
  (t) => [primaryKey({ columns: [t.skillId] })]
);

export const softwareFamiliarityEnum = pgEnum("software_familiarity_enum", [
  "learning",
  "familiar",
  "proficient",
  "expert",
]);

export const keywordPreferenceEnum = pgEnum("keyword_preference_enum", [
  "interest",
  "exclusion",
]);

export const userSoftware = pgTable("user_software", {
  softwareId: integer("software_id")
    .primaryKey()
    .references(() => software.id, { onDelete: "cascade" }),
  familiarity: softwareFamiliarityEnum("familiarity"),
});

export const userCertifications = pgTable(
  "user_certifications",
  {
    certificationId: integer("certification_id")
      .primaryKey()
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
  ],
);

export const userKeywords = pgTable("user_keywords", {
  keywordId: integer("keyword_id")
    .primaryKey()
    .references(() => keywords.id, { onDelete: "cascade" }),
  preference: keywordPreferenceEnum("preference").default("interest").notNull(),
});

// ── job_status_history ────────────────────────────────────────────────────────
// Written every time interview_stage changes. Powers the recent activity feed.

export const jobStatusHistory = pgTable("job_status_history", {
  id: serial("id").primaryKey(),
  jobId: integer("job_id")
    .notNull()
    .references(() => jobs.id, { onDelete: "cascade" }),
  fromStage: interviewStageEnum("from_stage"),
  toStage: interviewStageEnum("to_stage").notNull(),
  changedAt: timestamp("changed_at", { withTimezone: true }).defaultNow(),
});

// ── resume_versions ───────────────────────────────────────────────────────────
// Labels-only — no file storage. jobs.resume_version stores the label string.

export const resumeVersions = pgTable("resume_versions", {
  id: serial("id").primaryKey(),
  label: text("label").unique().notNull(),
  date: date("date"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// ── contacts ──────────────────────────────────────────────────────────────────

export const contacts = pgTable("contacts", {
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
});
