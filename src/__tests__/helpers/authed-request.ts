import { NextRequest } from 'next/server'

/**
 * Build a GET NextRequest carrying the standard test bearer token.
 *
 * Auth-gated GET route tests only need a request with the `Authorization`
 * header set; this helper removes the duplicated inline construction. The
 * unauthenticated (header-less) cases build a plain NextRequest directly.
 */
export function authedGet(url: string): NextRequest {
  return new NextRequest(url, {
    headers: { authorization: 'Bearer test-key' },
  })
}
