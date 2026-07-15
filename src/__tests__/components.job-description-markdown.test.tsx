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
})
