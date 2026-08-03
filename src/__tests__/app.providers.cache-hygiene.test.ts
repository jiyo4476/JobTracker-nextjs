import { describe, it, expect, beforeEach } from 'vitest'
import { QueryCache, QueryClient } from '@tanstack/react-query'
import { ApiError } from '@/lib/api'

// Reconstruct the exact cache-hygiene wiring Providers installs, so we can assert
// the QueryCache onError behavior without a DOM/render harness (test env is 'node').
function buildClient() {
  const client: QueryClient = new QueryClient({
    queryCache: new QueryCache({
      onError: (error) => {
        if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
          client.clear()
        }
      },
    }),
    defaultOptions: {
      queries: { staleTime: 30_000, retry: false, gcTime: Infinity },
    },
  })
  return client
}

async function runFailingQuery(client: QueryClient, key: string, error: unknown) {
  await client
    .fetchQuery({ queryKey: [key], queryFn: () => Promise.reject(error) })
    .catch(() => {})
}

describe('Providers cache hygiene — purge on auth boundary', () => {
  let client: QueryClient
  beforeEach(() => {
    client = buildClient()
  })

  it.each([401, 403])('clears all cached personal data when a query fails with %s', async (status) => {
    // Seed some cached personal data as if a prior identity had loaded it.
    client.setQueryData(['stats'], { trackedJobs: 8 })
    client.setQueryData(['jobs'], [{ id: 1 }])
    expect(client.getQueryData(['stats'])).toBeDefined()

    await runFailingQuery(client, 'activity', new ApiError(status, `API error ${status}`))

    // Every cached entry is gone — nothing can flash for the next identity.
    expect(client.getQueryData(['stats'])).toBeUndefined()
    expect(client.getQueryData(['jobs'])).toBeUndefined()
  })

  it('leaves the cache intact for non-auth errors (e.g. 500)', async () => {
    client.setQueryData(['stats'], { trackedJobs: 8 })

    await runFailingQuery(client, 'analytics', new ApiError(500, 'API error 500'))

    expect(client.getQueryData(['stats'])).toEqual({ trackedJobs: 8 })
  })

  it('leaves the cache intact for a generic (non-ApiError) failure', async () => {
    client.setQueryData(['stats'], { trackedJobs: 8 })

    await runFailingQuery(client, 'boom', new Error('network down'))

    expect(client.getQueryData(['stats'])).toEqual({ trackedJobs: 8 })
  })
})
