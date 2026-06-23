export interface ExtractedTags {
  skills: string[]
  software: string[]
  keywords: string[]
  certifications: string[]
}

const SKILLS = [
  'Python', 'TypeScript', 'JavaScript', 'Java', 'Go', 'Rust', 'C++', 'SQL',
  'GraphQL', 'REST', 'AWS', 'Azure', 'GCP', 'Docker', 'Kubernetes', 'Terraform',
  'React', 'Next.js', 'Node.js', 'FastAPI', 'Django', 'PostgreSQL', 'MySQL',
  'MongoDB', 'Redis', 'Git', 'CI/CD', 'Agile', 'Scrum', 'Linux',
]

const SOFTWARE = [
  'Jira', 'Confluence', 'Slack', 'GitHub', 'GitLab', 'Bitbucket', 'VS Code',
  'IntelliJ', 'Figma', 'Notion', 'Datadog', 'Splunk', 'Tableau', 'Snowflake',
  'dbt', 'Airflow', 'Spark',
]

const CERTIFICATIONS = [
  'AWS Certified', 'Azure Certified', 'GCP Certified', 'CPA', 'PMP', 'CISSP',
  'CompTIA', 'Kubernetes Administrator', 'Terraform Associate',
]

const KEYWORDS = [
  'remote', 'hybrid', 'on-site', 'full-stack', 'backend', 'frontend',
  'machine learning', 'data engineering', 'DevOps', 'platform engineering',
  'distributed systems', 'microservices', 'startup', 'series A', 'series B',
  'series C',
]

function escapeRegExp(term: string): string {
  return term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function compileTerms(terms: string[]) {
  return terms.map(term => ({
    term,
    pattern: new RegExp(`(?<![\\w])${escapeRegExp(term)}(?![\\w])`, 'i'),
  }))
}

const SKILL_PATTERNS = compileTerms(SKILLS)
const SOFTWARE_PATTERNS = compileTerms(SOFTWARE)
const CERTIFICATION_PATTERNS = compileTerms(CERTIFICATIONS)
const KEYWORD_PATTERNS = compileTerms(KEYWORDS)

function matchTerms(description: string, terms: ReturnType<typeof compileTerms>): string[] {
  return terms
    .filter(({ pattern }) => pattern.test(description))
    .map(({ term }) => term)
}

export function extractTags(description: string): ExtractedTags {
  return {
    skills: matchTerms(description, SKILL_PATTERNS),
    software: matchTerms(description, SOFTWARE_PATTERNS),
    keywords: matchTerms(description, KEYWORD_PATTERNS),
    certifications: matchTerms(description, CERTIFICATION_PATTERNS),
  }
}
