import { NextResponse, type NextRequest } from 'next/server'
import { sql } from 'drizzle-orm'
import { db } from '@/db'
import { requireAuth } from '@/lib/http'
import { logger, serializeError } from '@/lib/logger'

// READINESS probe — "are this instance's dependencies actually usable?"
//
// AUTHENTICATED on purpose. Whether the database is reachable is operational detail, so
// it is gated rather than exposed on the public domain. Liveness ("is the process up?")
// is the unauthenticated `/api/health/live`.
//
// `allowSameOrigin: false` keeps the forgeable Origin/Referer fallback from reaching this
// route: any non-browser client can set a matching Origin header, so an ops endpoint must
// require a real verified token. `principal: 'ingestion'` accepts an interactive user or a
// service principal, so monitoring can use client credentials.
//
// NOTE: the Jenkins deploy probe does NOT call this route — it has no OAuth credentials
// and polls `/api/health/live` instead. That means the deploy gate does not verify database
// reachability; see the API Reference for the accepted trade and the mitigation.
export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'no-store' } as const

export async function GET(req: NextRequest) {
  const denied = await requireAuth(req, { allowSameOrigin: false, principal: 'ingestion' })
  if (denied) return denied

  try {
    await db.execute(sql`select 1`)
  } catch (err) {
    // Log the real cause for operators; never return it. A driver error can carry the
    // connection string, host, or role name.
    logger.error('GET /api/health/ready database check failed', serializeError(err))
    return NextResponse.json({ status: 'degraded' }, { status: 503, headers: NO_STORE })
  }

  return NextResponse.json({ status: 'ok' }, { status: 200, headers: NO_STORE })
}
