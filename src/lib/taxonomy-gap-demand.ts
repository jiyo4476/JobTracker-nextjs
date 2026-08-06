import { sql } from 'drizzle-orm'
import {
  certifications, jobCertifications, jobKeywords, jobSkills, jobSoftware,
  jobs, keywords, skills, software, userJobState,
} from '@/db/schema'
import { escapeLikePattern } from '@/lib/db-utils'

export const GAP_JOB_TITLE_MAX_LENGTH = 200

const demandConfigs = {
  skills: {
    catalog: skills, catalogId: skills.id, name: skills.name,
    junction: jobSkills, junctionId: jobSkills.skillId, jobId: jobSkills.jobId,
  },
  software: {
    catalog: software, catalogId: software.id, name: software.name,
    junction: jobSoftware, junctionId: jobSoftware.softwareId, jobId: jobSoftware.jobId,
  },
  certifications: {
    catalog: certifications, catalogId: certifications.id, name: certifications.name,
    junction: jobCertifications, junctionId: jobCertifications.certificationId, jobId: jobCertifications.jobId,
  },
  keywords: {
    catalog: keywords, catalogId: keywords.id, name: keywords.name,
    junction: jobKeywords, junctionId: jobKeywords.keywordId, jobId: jobKeywords.jobId,
  },
} as const

export type GapDemandCategory = keyof typeof demandConfigs

export type GapDemandOptions = {
  category: GapDemandCategory
  /** Internal user id resolved from the verified request identity. */
  userId: number
  /** Filters returned taxonomy names, independently from the job-title corpus. */
  nameQuery: string
  /** Narrows demand to tracked jobs whose scraped posting title matches. */
  jobTitle?: string | null
}

/**
 * Builds the owner-scoped demand CTE for the taxonomy gap endpoint.
 *
 * The shared jobs catalog is joined through the caller's user_job_state rows so no
 * other user's tracked corpus contributes. `jobTitle` selects jobs; `nameQuery`
 * selects taxonomy names. LIKE metacharacters in both values are literal.
 */
export function buildGapDemandQuery({ category, userId, nameQuery, jobTitle }: GapDemandOptions) {
  const config = demandConfigs[category]
  const namePattern = `%${escapeLikePattern(nameQuery)}%`
  const title = jobTitle?.trim()
  const titleFilter = title
    ? sql`AND ${jobs.jobTitle} ILIKE ${`%${escapeLikePattern(title)}%`} ESCAPE '\\'`
    : sql``

  return sql`
    SELECT ${config.catalogId} AS taxonomy_id,
           ${config.name} AS name,
           CAST(COUNT(DISTINCT ${jobs.id}) AS int) AS job_count
    FROM ${config.catalog}
    JOIN ${config.junction} ON ${config.junctionId} = ${config.catalogId}
    JOIN ${jobs} ON ${config.jobId} = ${jobs.id}
      AND ${jobs.isActive} IS TRUE
      AND ${jobs.deletedAt} IS NULL
      ${titleFilter}
    JOIN ${userJobState} ON ${userJobState.jobId} = ${jobs.id}
      AND ${userJobState.userId} = ${userId}
      AND ${userJobState.isHidden} IS FALSE
    WHERE ${config.name} ILIKE ${namePattern} ESCAPE '\\'
    GROUP BY ${config.catalogId}, ${config.name}
  `
}
