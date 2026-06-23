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

function matchTerms(description: string, terms: string[]): string[] {
  const matched: string[] = []
  for (const term of terms) {
    // Escape special regex chars in the term
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const pattern = new RegExp(`(?<![\\w])${escaped}(?![\\w])`, 'i')
    if (pattern.test(description)) {
      matched.push(term)
    }
  }
  return matched
}

export function extractTags(description: string): ExtractedTags {
  return {
    skills: matchTerms(description, SKILLS),
    software: matchTerms(description, SOFTWARE),
    keywords: matchTerms(description, KEYWORDS),
    certifications: matchTerms(description, CERTIFICATIONS),
  }
}
