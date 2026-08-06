// @vitest-environment happy-dom

import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { JobsResponse, MeResponse } from '@/types/queries'

const mocks = vi.hoisted(() => ({ get: vi.fn() }))

vi.mock('@/lib/api', () => ({
  api: { get: mocks.get, post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}))
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

import { IdentityScopeProvider } from '@/lib/identity-scope'
import { personalKeys, useJobs } from '@/lib/queries'

function wrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={client}>
        <IdentityScopeProvider>{children}</IdentityScopeProvider>
      </QueryClientProvider>
    )
  }
}

describe('personal query identity boundary', () => {
  it('does not flash or request with cached old identity while /api/me revalidates', async () => {
    let resolveMe!: (me: MeResponse) => void
    const pendingMe = new Promise<MeResponse>((resolve) => { resolveMe = resolve })
    const newJobs = {
      scope: 'tracked', total: 0, page: 1, totalPages: 0, jobs: [],
    } satisfies JobsResponse

    mocks.get.mockImplementation((path: string) => {
      if (path === '/me') return pendingMe
      if (path.startsWith('/jobs?')) return Promise.resolve(newJobs)
      throw new Error(`Unexpected GET ${path}`)
    })

    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: Infinity } },
    })
    const params = { scope: 'tracked' as const }
    const oldJobs = {
      ...newJobs,
      total: 1,
      totalPages: 1,
      jobs: [{ id: 1, jobTitle: 'Old user job' } as unknown as JobsResponse['jobs'][number]],
    }
    client.setQueryData(['me'], {
      user_id: 10, email: null, display_name: null, is_admin: false,
    } satisfies MeResponse)
    client.setQueryData(personalKeys.jobs(10, params), oldJobs)

    const { result } = renderHook(() => useJobs(params), { wrapper: wrapper(client) })

    await waitFor(() => expect(mocks.get).toHaveBeenCalledWith('/me'))
    expect(result.current.data).toBeUndefined()
    expect(mocks.get.mock.calls.some(([path]) => String(path).startsWith('/jobs?'))).toBe(false)

    resolveMe({ user_id: 20, email: null, display_name: null, is_admin: false })

    await waitFor(() => expect(result.current.data).toEqual(newJobs))
    expect(client.getQueryData(personalKeys.jobs(20, params))).toEqual(newJobs)
    expect(mocks.get.mock.calls.filter(([path]) => String(path).startsWith('/jobs?'))).toHaveLength(1)
  })

  it('keeps confirmed personal data stable during a same-user revalidation', async () => {
    let resolveRefresh!: (me: MeResponse) => void
    const refresh = new Promise<MeResponse>((resolve) => { resolveRefresh = resolve })
    let meCalls = 0
    const jobs = {
      scope: 'tracked', total: 1, page: 1, totalPages: 1,
      jobs: [{ id: 1, jobTitle: 'Confirmed job' } as unknown as JobsResponse['jobs'][number]],
    } satisfies JobsResponse
    mocks.get.mockImplementation((path: string) => {
      if (path === '/me') {
        meCalls += 1
        return meCalls === 1
          ? Promise.resolve({ user_id: 10, email: null, display_name: null, is_admin: false })
          : refresh
      }
      if (path.startsWith('/jobs?')) return Promise.resolve(jobs)
      throw new Error(`Unexpected GET ${path}`)
    })
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const { result } = renderHook(() => useJobs({ scope: 'tracked' }), { wrapper: wrapper(client) })
    await waitFor(() => expect(result.current.data).toEqual(jobs))

    const refreshing = client.refetchQueries({ queryKey: ['me'] })
    await waitFor(() => expect(meCalls).toBe(2))
    expect(result.current.data).toEqual(jobs)

    resolveRefresh({ user_id: 10, email: null, display_name: null, is_admin: false })
    await refreshing
    expect(result.current.data).toEqual(jobs)
  })

  it('blocks and purges a confirmed identity after /api/me revalidation fails', async () => {
    let meCalls = 0
    const jobs = {
      scope: 'tracked', total: 0, page: 1, totalPages: 0, jobs: [],
    } satisfies JobsResponse
    mocks.get.mockImplementation((path: string) => {
      if (path === '/me') {
        meCalls += 1
        return meCalls === 1
          ? Promise.resolve({ user_id: 10, email: null, display_name: null, is_admin: false })
          : Promise.reject(new Error('session validation failed'))
      }
      if (path.startsWith('/jobs?')) return Promise.resolve(jobs)
      throw new Error(`Unexpected GET ${path}`)
    })
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const params = { scope: 'tracked' as const }
    const { result } = renderHook(() => useJobs(params), { wrapper: wrapper(client) })
    await waitFor(() => expect(result.current.data).toEqual(jobs))

    await client.refetchQueries({ queryKey: ['me'] })

    await waitFor(() => expect(result.current.data).toBeUndefined())
    expect(client.getQueryData(personalKeys.jobs(10, params))).toBeUndefined()
    expect(meCalls).toBe(2)
  })
})
