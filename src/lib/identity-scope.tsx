'use client'

import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { catalogKeys, isUserScopedKey, type UserScopeId } from '@/lib/queries/keys'
import type { MeResponse } from '@/types/queries'

type ValidatedIdentity = Pick<MeResponse, 'user_id' | 'is_admin'>

const IdentityScopeContext = createContext<ValidatedIdentity | undefined>(undefined)

export function useMe() {
  return useQuery<MeResponse>({
    queryKey: catalogKeys.me(),
    queryFn: () => api.get<MeResponse>('/me'),
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: 'always',
    retry: false,
  })
}

/**
 * Publishes only a validated identity to personal hooks. A same-user background
 * refresh leaves the last confirmed identity available, while an error or changed
 * user blocks descendants synchronously and purges every owner-scoped cache entry.
 */
export function IdentityScopeProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient()
  const me = useMe()
  const [validated, setValidated] = useState<ValidatedIdentity | undefined>()
  const responseIdentity = useMemo(() => me.data
    ? { user_id: me.data.user_id, is_admin: me.data.is_admin }
    : undefined, [me.data])
  const identityChanged = validated !== undefined &&
    responseIdentity !== undefined &&
    validated.user_id !== responseIdentity.user_id
  const blocked = me.isError || identityChanged

  useEffect(() => {
    if (me.isError) {
      queryClient.removeQueries({ predicate: (query) => isUserScopedKey(query.queryKey) })
      // Query state is the external identity source; mirror its terminal failure.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setValidated(undefined)
      return
    }
    if (!responseIdentity) return
    // Cached /me bytes are not a validated identity for a freshly mounted boundary
    // until their mandatory revalidation succeeds.
    if (validated === undefined && me.isFetching) return

    if (identityChanged) {
      queryClient.removeQueries({ predicate: (query) => isUserScopedKey(query.queryKey) })
    }
    // Publish only after the external /me query has produced a validated response.
    setValidated((current) =>
      current?.user_id === responseIdentity.user_id && current.is_admin === responseIdentity.is_admin
        ? current
        : responseIdentity,
    )
  }, [identityChanged, me.isError, me.isFetching, queryClient, responseIdentity, validated])

  const value = useMemo(() => blocked ? undefined : validated, [blocked, validated])
  return <IdentityScopeContext.Provider value={value}>{children}</IdentityScopeContext.Provider>
}

export function useUserScope(): UserScopeId | undefined {
  return useContext(IdentityScopeContext)?.user_id
}

export function useIsAdmin(): boolean {
  return useContext(IdentityScopeContext)?.is_admin === true
}
