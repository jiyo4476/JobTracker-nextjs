import { describe, it, expect } from 'vitest'
import {
  extractTags,
  mergeExtractedTags,
  SKILL_CATALOG,
  SOFTWARE_CATALOG,
  CERTIFICATION_CATALOG,
} from '@/lib/nlp-extract'

describe('extractTags', () => {
  it('splits languages, named products, and credentials across taxonomies', () => {
    // TAXONOMY-001 acceptance: CISSP → certifications, Docker → software, Python → skills
    const desc = 'Requires Python and Docker experience. CISSP preferred.'
    const result = extractTags(desc)
    expect(result.skills).toContain('Python')
    expect(result.software).toContain('Docker')
    expect(result.certifications).toContain('CISSP')
    // No category leaks
    expect(result.skills).not.toContain('Docker')
    expect(result.skills).not.toContain('CISSP')
    expect(result.software).not.toContain('Python')
    expect(result.software).not.toContain('CISSP')
    expect(result.certifications).not.toContain('Python')
    expect(result.certifications).not.toContain('Docker')
  })

  it('classifies named platforms as software, not skills', () => {
    const desc =
      'Stack: Kubernetes on AWS, PostgreSQL, Jenkins pipelines, Datadog monitoring, and Playwright tests.'
    const result = extractTags(desc)
    for (const name of ['Kubernetes', 'AWS', 'PostgreSQL', 'Jenkins', 'Datadog', 'Playwright']) {
      expect(result.software).toContain(name)
      expect(result.skills).not.toContain(name)
    }
  })

  it('retains languages, practices, and capabilities as skills', () => {
    const desc =
      'We value TypeScript, SQL, Test-Driven Development, Distributed Systems, and Infrastructure as Code.'
    const result = extractTags(desc)
    expect(result.skills).toContain('TypeScript')
    expect(result.skills).toContain('SQL')
    expect(result.skills).toContain('Test-Driven Development')
    expect(result.skills).toContain('Distributed Systems')
    expect(result.skills).toContain('Infrastructure as Code')
  })

  it('detects known software', () => {
    const desc = 'You will use Jira for project tracking and communicate via Slack. We use GitHub for code.'
    const result = extractTags(desc)
    expect(result.software).toContain('Jira')
    expect(result.software).toContain('Slack')
    expect(result.software).toContain('GitHub')
  })

  it('detects certifications', () => {
    const desc = 'AWS Certified Solutions Architect preferred. PMP is a bonus.'
    const result = extractTags(desc)
    expect(result.certifications).toContain('AWS Certified Solutions Architect')
    expect(result.certifications).toContain('PMP')
  })

  it('detects keywords', () => {
    const desc = 'This is a remote-friendly role focused on microservices and DevOps.'
    const result = extractTags(desc)
    expect(result.keywords).toContain('remote')
    expect(result.keywords).toContain('microservices')
    expect(result.keywords).toContain('DevOps')
  })

  it('returns empty arrays for unrecognized text', () => {
    const desc = 'Looking for a dynamic self-starter to join our team.'
    const result = extractTags(desc)
    expect(result.skills).toHaveLength(0)
    expect(result.software).toHaveLength(0)
    expect(result.keywords).toHaveLength(0)
    expect(result.certifications).toHaveLength(0)
  })

  it('is case-insensitive', () => {
    const desc = 'Experience with PYTHON, typescript, and docker required.'
    const result = extractTags(desc)
    expect(result.skills).toContain('Python')
    expect(result.skills).toContain('TypeScript')
    expect(result.software).toContain('Docker')
  })

  it('deduplicates repeated mentions', () => {
    const desc = 'Python Python Python is required. Python experience a must.'
    const result = extractTags(desc)
    const pythonCount = result.skills.filter(s => s === 'Python').length
    expect(pythonCount).toBe(1)
  })

  it('does not match partial words (e.g. "Go" inside "Google")', () => {
    const desc = 'Work with Google Cloud Platform and MongoDB.'
    const result = extractTags(desc)
    // "Go" should not match inside "Google"
    expect(result.skills).not.toContain('Go')
    expect(result.software).toContain('MongoDB')
    // "Google Cloud Platform" is an alias for GCP
    expect(result.software).toContain('GCP')
  })

  it('does not match "Java" inside "JavaScript"', () => {
    const desc = 'Strong JavaScript fundamentals expected.'
    const result = extractTags(desc)
    expect(result.skills).toContain('JavaScript')
    expect(result.skills).not.toContain('Java')
  })

  it('detects the expanded set with correct taxonomy owners', () => {
    const desc = 'We use Rust for systems work, Playwright for E2E testing, Kubernetes for orchestration, and Terraform for IaC.'
    const result = extractTags(desc)
    expect(result.skills).toContain('Rust')
    expect(result.skills).toContain('Infrastructure as Code')
    expect(result.skills).toContain('End-to-End Testing')
    expect(result.software).toContain('Playwright')
    expect(result.software).toContain('Kubernetes')
    expect(result.software).toContain('Terraform')
  })

  it('canonicalizes skill aliases', () => {
    const desc = 'Experience with Agile, Scrum, bash, and TDD required.'
    const result = extractTags(desc)
    expect(result.skills).toContain('Agile / Scrum')
    expect(result.skills).toContain('Bash / Shell Scripting')
    expect(result.skills).toContain('Test-Driven Development')
    expect(result.skills).not.toContain('Agile')
    expect(result.skills).not.toContain('Scrum')
    expect(result.skills).not.toContain('Bash')
    expect(result.skills).not.toContain('TDD')
  })

  it('canonicalizes software aliases', () => {
    const desc = 'Experience with Postgres, k8s, sklearn, and Rails required.'
    const result = extractTags(desc)
    expect(result.software).toContain('PostgreSQL')
    expect(result.software).toContain('Kubernetes')
    expect(result.software).toContain('scikit-learn')
    expect(result.software).toContain('Ruby on Rails')
    expect(result.software).not.toContain('Postgres')
    expect(result.software).not.toContain('k8s')
    expect(result.software).not.toContain('sklearn')
    expect(result.software).not.toContain('Rails')
  })

  it('collapses alias and canonical co-mentions to one entry', () => {
    const desc = 'We run k8s — Kubernetes experience required.'
    const result = extractTags(desc)
    expect(result.software.filter(s => s === 'Kubernetes')).toHaveLength(1)
  })

  it('canonicalizes certification aliases', () => {
    const desc = 'Security+ or Network+ required. CKA and Terraform Associate are a plus.'
    const result = extractTags(desc)
    expect(result.certifications).toContain('CompTIA Security+')
    expect(result.certifications).toContain('CompTIA Network+')
    expect(result.certifications).toContain('Certified Kubernetes Administrator (CKA)')
    expect(result.certifications).toContain('HashiCorp Terraform Associate')
    expect(result.certifications).not.toContain('Security+')
    expect(result.certifications).not.toContain('CKA')
  })

  it('detects named cloud certifications', () => {
    const desc = 'Preferred: AZ-104 or Google Cloud Professional Cloud Architect certification.'
    const result = extractTags(desc)
    expect(result.certifications).toContain('Microsoft Certified: Azure Administrator')
    expect(result.certifications).toContain('Google Cloud Professional Cloud Architect')
  })

  it('suppresses umbrella certifications when a specific one matched', () => {
    const desc = 'Must hold AWS Certified Solutions Architect. CompTIA Security+ is a plus.'
    const result = extractTags(desc)
    expect(result.certifications).toContain('AWS Certified Solutions Architect')
    expect(result.certifications).toContain('CompTIA Security+')
    expect(result.certifications).not.toContain('AWS Certified')
    expect(result.certifications).not.toContain('CompTIA')
  })

  it('keeps the umbrella certification when no specific one matched', () => {
    const desc = 'Any AWS Certified credential is welcome.'
    const result = extractTags(desc)
    expect(result.certifications).toContain('AWS Certified')
  })

  it('treats security clearance as a skill, never a certification', () => {
    const desc = 'Active TS/SCI clearance required. CISSP preferred.'
    const result = extractTags(desc)
    expect(result.skills).toContain('Security Clearance — TS/SCI')
    expect(result.certifications).not.toContain('Security Clearance — TS/SCI')
    expect(result.certifications).not.toContain('TS/SCI')
    expect(result.certifications).toContain('CISSP')
  })

  it('detects ML/data terms with correct owners', () => {
    const desc = 'Role requires PyTorch, scikit-learn, Pandas, and experience with ETL pipelines and Snowflake.'
    const result = extractTags(desc)
    expect(result.software).toContain('PyTorch')
    expect(result.software).toContain('scikit-learn')
    expect(result.software).toContain('Pandas')
    expect(result.software).toContain('Snowflake')
    expect(result.skills).toContain('ETL Pipelines')
  })
})

describe('taxonomy catalog integrity', () => {
  it('assigns every canonical term and alias to exactly one structured category', () => {
    const owner = new Map<string, string>()
    const catalogs = {
      skills: SKILL_CATALOG,
      software: SOFTWARE_CATALOG,
      certifications: CERTIFICATION_CATALOG,
    }
    for (const [taxonomy, entries] of Object.entries(catalogs)) {
      for (const entry of entries) {
        for (const term of [entry.canonical, ...(entry.aliases ?? [])]) {
          const key = term.toLowerCase()
          expect(
            owner.has(key),
            `"${term}" appears in both ${owner.get(key)} and ${taxonomy}`,
          ).toBe(false)
          owner.set(key, taxonomy)
        }
      }
    }
  })

  it('does not list any security clearance under certifications', () => {
    for (const entry of CERTIFICATION_CATALOG) {
      for (const term of [entry.canonical, ...(entry.aliases ?? [])]) {
        expect(term.toLowerCase()).not.toContain('clearance')
        expect(term).not.toContain('TS/SCI')
      }
    }
  })
})

describe('mergeExtractedTags', () => {
  it('keeps caller tags first and appends backend-only matches in every taxonomy', () => {
    expect(
      mergeExtractedTags(
        {
          skills: ['TypeScript'],
          software: ['Jira'],
          keywords: ['platform engineering'],
          certifications: ['PMP'],
        },
        {
          skills: ['TypeScript', 'Python'],
          software: ['Jira', 'GitHub'],
          keywords: ['platform engineering', 'remote'],
          certifications: ['PMP', 'AWS Certified'],
        },
      ),
    ).toEqual({
      skills: ['TypeScript', 'Python'],
      software: ['Jira', 'GitHub'],
      keywords: ['platform engineering', 'remote'],
      certifications: ['PMP', 'AWS Certified'],
    })
  })

  it('never moves a caller value into another category', () => {
    // Caller put Docker under skills; the merge must keep it there untouched
    const merged = mergeExtractedTags(
      { skills: ['Docker'], software: [], keywords: [], certifications: [] },
      { skills: ['Python'], software: ['Docker'], keywords: [], certifications: [] },
    )
    expect(merged.skills).toEqual(['Docker', 'Python'])
    expect(merged.software).toEqual(['Docker'])
  })

  it('deduplicates names case-insensitively while preserving caller spelling', () => {
    const merged = mergeExtractedTags(
      { skills: ['typescript'], software: [], keywords: [], certifications: [] },
      { skills: ['TypeScript', 'Python'], software: [], keywords: [], certifications: [] },
    )

    expect(merged.skills).toEqual(['typescript', 'Python'])
  })

  it('caps merged taxonomies at 100 caller-first values', () => {
    const callerSkills = Array.from({ length: 99 }, (_, index) => `Caller ${index}`)
    const merged = mergeExtractedTags(
      { skills: callerSkills, software: [], keywords: [], certifications: [] },
      { skills: ['Backend one', 'Backend two'], software: [], keywords: [], certifications: [] },
    )

    expect(merged.skills).toHaveLength(100)
    expect(merged.skills.at(-1)).toBe('Backend one')
  })
})
