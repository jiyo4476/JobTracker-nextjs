import { NextResponse } from 'next/server'
import { sql } from 'drizzle-orm'
import { db } from '@/db'
import { logger, serializeError } from '@/lib/logger'

// Deployment readiness probe. Deliberately UNAUTHENTICATED.
//
// The deploy pipeline polls this from inside the candidate container before the new
// image is allowed to take traffic, and it holds no OAuth credentials. It previously
// polled `/api/stats`, but API-013 (slice 2) turned that into a personal owner-scoped
// route: it now answers 401 to an unauthenticated caller and can therefore never
// signal readiness.
//
// The DB round-trip is intentional. `/api/stats` exercised the database, so probing a
// liveness-only endpoint would silently weaken the deploy gate and let a container
// that cannot reach Postgres be promoted.
//
// The body is deliberately contentless beyond a status string. This path is reachable
// on the public domain, so it must not disclose versions, environment, connection
// details, or database error text — those go to the server log only.
//
// `force-dynamic` keeps Next from evaluating this at build time, which would attempt a
// database connection during `npm run build`.
export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'no-store' } as const

export async function GET() {
  try {
    await db.execute(sql`select 1`)
  } catch (err) {
    logger.error('GET /api/health database check failed', serializeError(err))
    return NextResponse.json({ status: 'degraded' }, { status: 503, headers: NO_STORE })
  }

  return NextResponse.json({ status: 'ok' }, { status: 200, headers: NO_STORE })
}
