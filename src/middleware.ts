import { NextRequest, NextResponse } from 'next/server'
import { logger } from '@/lib/logger'

export function middleware(req: NextRequest) {
  const start = Date.now()
  const reqId = req.headers.get('x-request-id') ?? crypto.randomUUID()
  const { method, nextUrl } = req
  const path = nextUrl.pathname

  const reqLogger = logger.child({ reqId, method, path })
  reqLogger.debug('request received')

  const res = NextResponse.next({
    request: {
      headers: new Headers({
        ...Object.fromEntries(req.headers),
        'x-request-id': reqId,
      }),
    },
  })

  res.headers.set('x-request-id', reqId)

  // Next.js middleware cannot observe the final response status from downstream
  // handlers, so we log what we know at egress time.
  const ms = Date.now() - start
  reqLogger.info('request processed', { durationMs: ms })

  return res
}

export const config = {
  // Only run on API routes to avoid noise from static assets and page renders.
  matcher: '/api/:path*',
}
