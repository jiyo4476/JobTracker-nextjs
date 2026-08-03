import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import type { z } from 'zod'
import { requireAuthentication } from '@/lib/auth'
import { logger, serializeError } from '@/lib/logger'

// Default and hard-cap page sizes for the otherwise-unbounded lookup/company
// list endpoints. These previously returned every row (a full table scan whose
// result grows without bound as the scraper adds tags); a bounded page keeps the
// response — and the memory it takes to build — predictable.
export const DEFAULT_LIST_LIMIT = 500
export const MAX_LIST_LIMIT = 500

/**
 * Parse `?limit` and `?page` for a bounded list endpoint. `limit` defaults to
 * DEFAULT_LIST_LIMIT and is clamped to [1, MAX_LIST_LIMIT]; `page` defaults to 1
 * (1-indexed). Any non-numeric / out-of-range input falls back to the defaults
 * instead of erroring, so callers never turn bad query strings into a 500.
 *
 * `req` is optional so the same handler can be unit-tested with `GET()`.
 */
export function parseListPagination(req?: NextRequest): { limit: number; offset: number } {
  const params = req?.nextUrl.searchParams

  const rawLimit = Number(params?.get('limit') ?? DEFAULT_LIST_LIMIT)
  const limit =
    Number.isFinite(rawLimit) && rawLimit > 0
      ? Math.min(Math.floor(rawLimit), MAX_LIST_LIMIT)
      : DEFAULT_LIST_LIMIT

  const rawPage = Number(params?.get('page') ?? 1)
  const page = Number.isSafeInteger(rawPage) && rawPage > 0 ? rawPage : 1

  const offset = (page - 1) * limit
  return { limit, offset: Number.isSafeInteger(offset) ? offset : 0 }
}

// Shared response/parse helpers for API route handlers. These centralize the
// error envelopes that route tests assert on ({ error: '…' }) so the shape lives
// in one place instead of being copy-pasted into every handler.

/** Standard 401 for a failed auth check. */
export function unauthorized(): NextResponse {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}

/**
 * JSON response for owner-scoped/personal data. Sets `Cache-Control: private, no-store`
 * so a user's private job state, contacts, or resume choice can never be cached by a
 * shared proxy or served to another user (API-013). Use this for every response that
 * contains per-user state until an owner-partitioned server cache exists.
 */
export function privateJson(
  data: unknown,
  init?: Parameters<typeof NextResponse.json>[1],
): NextResponse {
  const res = NextResponse.json(data, init)
  res.headers.set('Cache-Control', 'private, no-store')
  return res
}

/**
 * Guard a route with the same auth check every handler uses. Returns a 401
 * NextResponse to return early, or null when the caller is authorized:
 *
 *   const denied = await requireAuth(req)
 *   if (denied) return denied
 */
export async function requireAuth(
  req: NextRequest,
  options?: Parameters<typeof requireAuthentication>[1],
): Promise<NextResponse | null> {
  return (await requireAuthentication(req, options)) ? null : unauthorized()
}

type JsonBodyResult<T> =
  | { ok: true; data: T }
  | { ok: false; response: NextResponse }

/**
 * Read a JSON request body and validate it against a Zod schema. Returns the
 * parsed data, or a ready-to-return NextResponse:
 *   - 400 { error: 'Invalid JSON' } when the body isn't valid JSON
 *   - 400 { error: <flatten()> } when validation fails
 *
 *   const parsed = await readJsonBody(req, someSchema)
 *   if (!parsed.ok) return parsed.response
 *   // use parsed.data
 */
export async function readJsonBody<T extends z.ZodTypeAny>(
  req: NextRequest,
  schema: T,
): Promise<JsonBodyResult<z.infer<T>>> {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return { ok: false, response: NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
  }
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return {
      ok: false,
      response: NextResponse.json({ error: parsed.error.flatten() }, { status: 400 }),
    }
  }
  return { ok: true, data: parsed.data }
}

/**
 * Wrap a route handler so any uncaught throw is logged and mapped to the
 * standard `{ error: 'Internal server error' }` 500 that every other route
 * already returns — so a DB fault can never leak the framework's default HTML
 * 500.
 *
 * This is a signature-preserving higher-order wrapper: it forwards every
 * argument (`req`, and the `{ params }` context for dynamic routes) to the
 * inner handler and returns a function with the route's original Next.js
 * signature, so it's assigned straight to the exported handler:
 *
 *   export const GET = withErrorHandling('GET /api/resume-versions', async () => {
 *     const rows = await db.select()…
 *     return NextResponse.json(rows)
 *   })
 *
 *   export const PATCH = withErrorHandling(
 *     'PATCH /api/resume-versions/[id]',
 *     async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => { … },
 *   )
 *
 * The generic `Args` tuple captures whatever parameters the inner handler
 * declares (0-arg, `(req)`, or `(req, ctx)`), so both static and dynamic route
 * handlers type-check and Next.js route-type validation is unaffected.
 */
/**
 * Wrap a handler as a DEPRECATED alias of a canonical route. Forwards every argument to
 * the inner handler and annotates its response with the standard deprecation signals
 * (RFC 8594 `Deprecation` + a `Link rel="successor-version"` to the canonical path) so a
 * client can discover the replacement without breaking. Used to keep the legacy
 * `/api/jobs[/id]` catalog-mutation paths working as admin-only aliases of the new
 * `/api/admin/jobs[/id]` namespace during the API-013 cutover.
 */
export function deprecatedAlias<Args extends unknown[]>(
  handler: (...args: Args) => Promise<NextResponse>,
  successorPath: string,
): (...args: Args) => Promise<NextResponse> {
  return async (...args: Args): Promise<NextResponse> => {
    const res = await handler(...args)
    res.headers.set('Deprecation', 'true')
    res.headers.set('Link', `<${successorPath}>; rel="successor-version"`)
    return res
  }
}

export function withErrorHandling<Args extends unknown[]>(
  routeName: string,
  handler: (...args: Args) => Promise<NextResponse>,
): (...args: Args) => Promise<NextResponse> {
  return async (...args: Args): Promise<NextResponse> => {
    try {
      return await handler(...args)
    } catch (err) {
      logger.error(`${routeName} failed`, serializeError(err))
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
  }
}
