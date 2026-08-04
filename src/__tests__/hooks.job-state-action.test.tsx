// @vitest-environment happy-dom

import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { JobsResponse } from '@/types/queries'

const mocks = vi.hoisted(() => ({
  patch: vi.fn(),
  del: vi.fn(),
  toastError: vi.fn(),
}))

vi.mock('@/lib/api', () => ({
  api: { patch: mocks.patch, delete: mocks.del, get: vi.fn(), post: vi.fn() },
}))
vi.mock('sonner', () => ({ toast: { error: mocks.toastError, success: vi.fn() } }))

import { useJobStateAction } from '@/lib/queries'

function baseResponse(): JobsResponse {
  return {
    scope: 'tracked',
    total: 2,
    page: 1,
    totalPages: 1,
    jobs: [
      // minimal rows; only the fields the optimistic transform touches matter
      { id: 1, isTracked: true, isHidden: false } as JobsResponse['jobs'][number],
      { id: 2, isTracked: true, isHidden: false } as JobsResponse['jobs'][number],
    ],
  }
}

function wrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
}

describe('useJobStateAction optimistic updates', () => {
  let client: QueryClient
  const listKey = ['jobs', { scope: 'tracked' }]

  beforeEach(() => {
    vi.clearAllMocks()
    client = new QueryClient({ defaultOptions: { mutations: { retry: false }, queries: { retry: false } } })
    client.setQueryData(listKey, baseResponse())
  })

  it('optimistically drops a hidden row before the request resolves', async () => {
    mocks.patch.mockResolvedValue({})
    const { result } = renderHook(() => useJobStateAction(), { wrapper: wrapper(client) })

    result.current.mutate({ id: 1, action: 'hide' })

    await waitFor(() => {
      const data = client.getQueryData<JobsResponse>(listKey)!
      expect(data.jobs.map(j => j.id)).toEqual([2])
      expect(data.total).toBe(1)
    })
    expect(mocks.patch).toHaveBeenCalledWith('/jobs/1/state', { is_hidden: true })
  })

  it('rolls the cache back when the request fails', async () => {
    mocks.patch.mockRejectedValue(new Error('boom'))
    const { result } = renderHook(() => useJobStateAction(), { wrapper: wrapper(client) })

    result.current.mutate({ id: 1, action: 'hide' })

    await waitFor(() => expect(result.current.isError).toBe(true))
    const data = client.getQueryData<JobsResponse>(listKey)!
    expect(data.jobs.map(j => j.id)).toEqual([1, 2])
    expect(data.total).toBe(2)
    expect(mocks.toastError).toHaveBeenCalled()
  })

  it('remove issues a DELETE to the state route', async () => {
    mocks.del.mockResolvedValue({ success: true })
    const { result } = renderHook(() => useJobStateAction(), { wrapper: wrapper(client) })

    result.current.mutate({ id: 2, action: 'remove' })

    await waitFor(() => expect(mocks.del).toHaveBeenCalledWith('/jobs/2/state'))
  })
})
