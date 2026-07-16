import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { JobDescriptionMarkdown } from '@/components/jobs/JobDescriptionMarkdown'

describe('JobDescriptionMarkdown', () => {
  it('renders structured Markdown and GitHub-flavored Markdown', () => {
    const html = renderToStaticMarkup(
      <JobDescriptionMarkdown>{`# Senior Engineer

Build with **TypeScript**.

- APIs
- Services

~~Legacy~~

| Skill | Level |
| --- | --- |
| React | Senior |`}</JobDescriptionMarkdown>,
    )

    expect(html).toContain('<h1')
    expect(html).toContain('<strong>TypeScript</strong>')
    expect(html).toContain('<ul')
    expect(html).toContain('<del>Legacy</del>')
    expect(html).toContain('<table')
  })

  it('does not interpret raw HTML and secures rendered links', () => {
    const html = renderToStaticMarkup(
      <JobDescriptionMarkdown>{`<script>alert('unsafe')</script>

[Company](https://example.com/jobs)`}</JobDescriptionMarkdown>,
    )

    expect(html).not.toContain('<script>')
    expect(html).not.toContain("alert('unsafe')")
    expect(html).toContain('href="https://example.com/jobs"')
    expect(html).toContain('target="_blank"')
    expect(html).toContain('rel="noopener noreferrer"')
  })

  it('repairs concatenated scraper Markdown for display', () => {
    const source = '#Markdown Test **Company Overview **Deepgram builds voice AI. ****Company Operating Rhythm ****At Deepgram, we use AI.'
    const html = renderToStaticMarkup(<JobDescriptionMarkdown>{source}</JobDescriptionMarkdown>)

    expect(html).toContain('<h1')
    expect(html).toContain('Markdown Test</h1>')
    expect(html).toContain('<strong>Company Overview</strong>')
    expect(html).toContain('<strong>Company Operating Rhythm</strong>')
    expect(html).not.toContain('#Markdown Test')
    expect(html).not.toContain('****')
  })

  it('repairs collapsed headings and lists from legacy extension payloads', () => {
    const source =
      '**Position Overview** Intro text. **Job Profile** # ** Position Overview** Body text. # **Job Description** - Manages quality. - Oversees testing. # **Qualifications** Successful candidates apply.'
    const html = renderToStaticMarkup(<JobDescriptionMarkdown>{source}</JobDescriptionMarkdown>)

    expect(html).toContain('<strong>Position Overview</strong>')
    expect(html).toContain('<h1')
    expect(html).toContain('<strong>Job Description</strong></h1>')
    expect(html).toContain('<strong>Qualifications</strong></h1>')
    expect(html).toContain('<ul')
    expect(html).toContain('<li>Manages quality.</li>')
    expect(html).toContain('<li>Oversees testing.</li>')
    expect(html).not.toContain('# <strong>')
  })

  it('leaves isolated inline hash-bold prose unchanged', () => {
    const source = 'Use # **Release** notes when documenting v1.2 - Release Candidate.'
    const html = renderToStaticMarkup(<JobDescriptionMarkdown>{source}</JobDescriptionMarkdown>)

    expect(html).not.toContain('<h1')
    expect(html).not.toContain('<ul')
    expect(html).toContain('# <strong>Release</strong>')
    expect(html).toContain('v1.2 - Release Candidate')
  })

  it('does not split punctuation-delimited hyphens in ordinary prose', () => {
    const source = '- First real item. v1.2 - Release Candidate remains inline.'
    const html = renderToStaticMarkup(<JobDescriptionMarkdown>{source}</JobDescriptionMarkdown>)

    expect(html.match(/<li>/g)).toHaveLength(1)
    expect(html).toContain('v1.2 - Release Candidate remains inline.')
  })
})
