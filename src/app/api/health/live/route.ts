import { NextResponse } from 'next/server'

// LIVENESS probe — "is this process up and serving HTTP?"
//
// Deliberately UNAUTHENTICATED and deliberately WITHOUT any dependency check.
//
// The deploy pipeline polls this from inside the candidate container before the new
// image is allowed to take traffic, and it holds no OAuth credentials. It originally
// polled `/api/stats`, but API-013 (slice 2) turned that into a personal owner-scoped
// route: it answers 401 to an unauthenticated caller and so could never signal that
// the container was up.
//
// Do NOT add an auth gate here — a 401 breaks every deployment.
// Do NOT add a database or other dependency check here — this path is reachable on the
// public domain, and an unauthenticated endpoint must not disclose infrastructure state.
// Dependency health is `/api/health/ready`, which is authenticated. Tests assert both.
//
// `force-dynamic` keeps Next from prerendering this at build time so the answer always
// reflects the running process rather than a build-time constant.
export const dynamic = 'force-dynamic'

export async function GET() {
  // Reaching this line is the entire signal: the process is alive, the HTTP listener is
  // bound, and the route table built. No I/O, so it cannot fail for a downstream reason.
  return NextResponse.json(
    { status: 'ok' },
    { status: 200, headers: { 'Cache-Control': 'no-store' } },
  )
}
