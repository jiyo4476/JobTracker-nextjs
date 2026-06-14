// Re-export inferred types from Drizzle schema so components import from one place.
import type { InferSelectModel, InferInsertModel } from "drizzle-orm";
import type {
  jobs,
  companies,
  contacts,
  skills,
  software,
  keywords,
  certifications,
  userSkills,
  jobStatusHistory,
  resumeVersions,
} from "@/db/schema";

export type Job = InferSelectModel<typeof jobs>;
export type NewJob = InferInsertModel<typeof jobs>;
export type Company = InferSelectModel<typeof companies>;
export type NewCompany = InferInsertModel<typeof companies>;
export type Contact = InferSelectModel<typeof contacts>;
export type Skill = InferSelectModel<typeof skills>;
export type Software = InferSelectModel<typeof software>;
export type Keyword = InferSelectModel<typeof keywords>;
export type Certification = InferSelectModel<typeof certifications>;
export type UserSkill = InferSelectModel<typeof userSkills>;
export type JobStatusHistory = InferSelectModel<typeof jobStatusHistory>;
export type ResumeVersion = InferSelectModel<typeof resumeVersions>;
