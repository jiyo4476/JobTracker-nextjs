import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import type { z } from 'zod'
import { requireAuthentication } from '@/lib/auth'

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
  const page = Number.isFinite(rawPage) && rawPage > 0 ? Math.floor(rawPage) : 1

  return { limit, offset: (page - 1) * limit }
}

// Shared response/parse helpers for API route handlers. These centralize the
// error envelopes that route tests assert on ({ error: '…' }) so the shape lives
// in one place instead of being copy-pasted into every handler.

/** Standard 401 for a failed auth check. */
export function unauthorized(): NextResponse {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
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
