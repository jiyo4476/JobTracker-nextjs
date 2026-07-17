import { sql } from 'drizzle-orm'
import {
  certifications,
  jobCertifications,
  jobKeywords,
  jobSkills,
  jobSoftware,
  jobs,
  keywords,
  skills,
  software,
} from '@/db/schema'

export const COMPANY_DEMAND_LIMIT = 10

const demandConfigs = {
  skills: {
    junction: jobSkills,
    relationId: jobSkills.skillId,
    catalog: skills,
    catalogId: skills.id,
    name: skills.name,
    jobId: jobSkills.jobId,
  },
  software: {
    junction: jobSoftware,
    relationId: jobSoftware.softwareId,
    catalog: software,
    catalogId: software.id,
    name: software.name,
    jobId: jobSoftware.jobId,
  },
  certifications: {
    junction: jobCertifications,
    relationId: jobCertifications.certificationId,
    catalog: certifications,
    catalogId: certifications.id,
    name: certifications.name,
    jobId: jobCertifications.jobId,
  },
  keywords: {
    junction: jobKeywords,
    relationId: jobKeywords.keywordId,
    catalog: keywords,
    catalogId: keywords.id,
    name: keywords.name,
    jobId: jobKeywords.jobId,
  },
} as const

export type CompanyDemandCategory = keyof typeof demandConfigs

export function buildCompanyDemandQuery(category: CompanyDemandCategory, companyId: number) {
  const config = demandConfigs[category]
  return sql`
    SELECT ${config.catalogId} AS id,
           ${config.name} AS name,
           CAST(COUNT(DISTINCT ${config.jobId}) AS int) AS "jobCount"
    FROM ${config.junction}
    JOIN ${config.catalog} ON ${config.relationId} = ${config.catalogId}
    JOIN ${jobs} ON ${config.jobId} = ${jobs.id}
    WHERE ${jobs.companyId} = ${companyId}
      AND ${jobs.isActive} IS TRUE
      AND ${jobs.deletedAt} IS NULL
    GROUP BY ${config.catalogId}, ${config.name}
    ORDER BY "jobCount" DESC, ${config.name} ASC
    LIMIT ${COMPANY_DEMAND_LIMIT + 1}
  `
}
