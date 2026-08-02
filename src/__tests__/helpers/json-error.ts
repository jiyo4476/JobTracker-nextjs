import { expect } from 'vitest'

/**
 * Assert a route returned the standard JSON error envelope on a 500 — i.e. a
 * forced DB fault surfaces as `{ error }` JSON, never the framework's default
 * HTML 500. Shared across the route error-envelope tests. (TECHDEBT-004)
 */
export async function expectJsonError(res: Response) {
  expect(res.status).toBe(500)
  expect(res.headers.get('content-type')).toContain('application/json')
  const json = await res.json()
  expect(json).toHaveProperty('error')
}
