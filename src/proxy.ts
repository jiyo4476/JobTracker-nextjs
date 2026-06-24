import { NextRequest, NextResponse } from 'next/server'
import { logger } from '@/lib/logger'

export function proxy(req: NextRequest) {
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

  // Next.js proxy cannot observe the final response status from downstream
  // handlers. durationMs here is proxy-only, not end-to-end request latency.
  const middlewareDurationMs = Date.now() - start
  reqLogger.info('request processed', { middlewareDurationMs })

  return res
}

export const config = {
  // Only run on API routes to avoid noise from static assets and page renders.
  matcher: '/api/:path*',
}
