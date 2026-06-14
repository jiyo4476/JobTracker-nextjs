import {
  pgTable,
  pgEnum,
  serial,
  text,
  boolean,
  integer,
  smallint,
  char,
  date,
  timestamp,
  unique,
  index,
  primaryKey,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

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

export const sourcePlatformEnum = pgEnum("source_platform_enum", [
  "linkedin",
  "indeed",
  "glassdoor",
  "dice",
  "lever",
  "greenhouse",
  "workday",
  "angellist",
  "direct",
  "other",
]);

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

// ── companies ────────────────────────────────────────────────────────────────

export const companies = pgTable("companies", {
  id: serial("id").primaryKey(),
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
    companyId: integer("company_id").references(() => companies.id),
    jobTitle: text("job_title").notNull(),
    jobLink: text("job_link"),
    jobLocation: text("job_location"),
    isRemote: boolean("is_remote").default(false),
    sourcePlatform: sourcePlatformEnum("source_platform"),
    externalJobId: text("external_job_id"),
    jobType: jobTypeEnum("job_type"),
    experienceLevel: experienceLevelEnum("experience_level"),
    jobDescription: text("job_description"),
    salaryMin: integer("salary_min"), // cents
    salaryMax: integer("salary_max"), // cents
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
    unique("jobs_external_dedup").on(t.externalJobId, t.sourcePlatform).nullsNotDistinct(),
    index("jobs_company_id_idx").on(t.companyId),
    index("jobs_interview_stage_idx").on(t.interviewStage),
    index("jobs_date_found_idx").on(t.dateFound),
    index("jobs_is_active_idx").on(t.isActive),
    index("jobs_source_platform_idx").on(t.sourcePlatform),
    index("jobs_priority_idx").on(t.priority),
    // GIN index for full-text search on job_description — add via raw migration after generate
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

// ── contacts ──────────────────────────────────────────────────────────────────

export const contacts = pgTable("contacts", {
  id: serial("id").primaryKey(),
  jobId: integer("job_id")
    .notNull()
    .references(() => jobs.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  email: text("email"),
  phone: text("phone"),
  role: text("role"),
  contactedAt: date("contacted_at"),
  notes: text("notes"),
});
