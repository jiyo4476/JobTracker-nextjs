import { describe, it, expect } from 'vitest'
import { extractTags } from '@/lib/nlp-extract'

describe('extractTags', () => {
  it('detects known skills in a sample description', () => {
    const desc = 'We need a developer with Python, TypeScript, and Docker experience. AWS is a plus.'
    const result = extractTags(desc)
    expect(result.skills).toContain('Python')
    expect(result.skills).toContain('TypeScript')
    expect(result.skills).toContain('Docker')
    expect(result.skills).toContain('AWS')
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
    expect(result.certifications).toContain('AWS Certified')
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
    expect(result.skills).toContain('Docker')
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
    expect(result.skills).toContain('MongoDB')
  })

  it('detects expanded skill set — Rust, Playwright, Kubernetes, Terraform', () => {
    const desc = 'We use Rust for systems work, Playwright for E2E testing, Kubernetes for orchestration, and Terraform for IaC.'
    const result = extractTags(desc)
    expect(result.skills).toContain('Rust')
    expect(result.skills).toContain('Playwright')
    expect(result.skills).toContain('Kubernetes')
    expect(result.skills).toContain('Terraform')
    expect(result.skills).toContain('Infrastructure as Code')
  })

  it('canonicalizes aliases to canonical skill names', () => {
    const desc = 'Experience with Postgres, Agile, Scrum, and k8s required.'
    const result = extractTags(desc)
    // Aliases should resolve to canonical names
    expect(result.skills).toContain('PostgreSQL')
    expect(result.skills).toContain('Agile / Scrum')
    expect(result.skills).toContain('Kubernetes')
    // Aliases themselves should not appear as separate entries
    expect(result.skills).not.toContain('Postgres')
    expect(result.skills).not.toContain('Agile')
    expect(result.skills).not.toContain('Scrum')
    expect(result.skills).not.toContain('k8s')
  })

  it('detects ML/data skills', () => {
    const desc = 'Role requires PyTorch, scikit-learn, Pandas, and experience with ETL pipelines and Snowflake.'
    const result = extractTags(desc)
    expect(result.skills).toContain('PyTorch')
    expect(result.skills).toContain('scikit-learn')
    expect(result.skills).toContain('Pandas')
    expect(result.skills).toContain('ETL Pipelines')
    expect(result.skills).toContain('Snowflake')
  })
})
