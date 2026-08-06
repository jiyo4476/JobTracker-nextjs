import { describe, expect, it } from 'vitest'
import nextConfig from '../../next.config'

// PAGE-017 slice 4 — the deep-link/redirect map.
//
// Redirects are evaluated BEFORE the filesystem, so a sloppy `:id` pattern silently
// shadows real pages. These assertions pin both the destinations and the fact that the
// dynamic rule cannot capture the sibling `new` route.

type Redirect = { source: string; destination: string; permanent: boolean }

async function redirects(): Promise<Redirect[]> {
  const configured = nextConfig.redirects
  if (!configured) throw new Error('next.config.ts declares no redirects')
  return (await configured()) as Redirect[]
}

/**
 * Minimal path-pattern matcher covering the two forms this config uses: `:name` (one
 * segment) and `:name(regex)` (one segment constrained by an inline regex). Written out
 * rather than imported from Next's vendored, untyped `path-to-regexp` so the assertion
 * has no private-API dependency.
 */
function matches(source: string, path: string): boolean {
  const pattern = source.replace(
    /:([A-Za-z_][A-Za-z0-9_]*)(\(([^)]+)\))?/g,
    (_all, _name, _group, inline: string | undefined) => inline ?? '[^/]+',
  )
  return new RegExp(`^${pattern}$`).test(path)
}

describe('PAGE-017 redirect map', () => {
  it('routes the admin namespace entry points to a real destination', async () => {
    const map = new Map((await redirects()).map(r => [r.source, r]))

    expect(map.get('/admin')?.destination).toBe('/jobs?scope=catalog')
    expect(map.get('/admin/jobs')?.destination).toBe('/jobs?scope=catalog')
    expect(map.get('/admin/jobs/:id(\\d+)')?.destination).toBe('/admin/jobs/:id/edit')
  })

  it('uses temporary (307) redirects for the young admin namespace', async () => {
    for (const rule of await redirects()) {
      expect(rule.permanent).toBe(false)
    }
  })

  it('does not shadow /admin/jobs/new with the numeric id rule', async () => {
    const rule = (await redirects()).find(r => r.source.startsWith('/admin/jobs/:id'))!

    expect(matches(rule.source, '/admin/jobs/42')).toBe(true)
    expect(matches(rule.source, '/admin/jobs/new')).toBe(false)
  })

  it('leaves the repurposed personal routes resolving in place', async () => {
    const sources = (await redirects()).map(r => r.source)

    // /jobs/[id]/edit is now the PERSONAL editor and /jobs/new is catalog search/select.
    // Redirecting either would break a page that legitimately lives there.
    for (const rule of sources) {
      expect(matches(rule, '/jobs/5/edit')).toBe(false)
      expect(matches(rule, '/jobs/new')).toBe(false)
    }
  })
})
