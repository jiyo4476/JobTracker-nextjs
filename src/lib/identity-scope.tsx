'use client'

import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ApiError, api } from '@/lib/api'
import { catalogKeys, isUserScopedKey, type UserScopeId } from '@/lib/queries/keys'
import type { MeResponse } from '@/types/queries'

type ValidatedIdentity = Pick<MeResponse, 'user_id' | 'is_admin'>

const IdentityScopeContext = createContext<ValidatedIdentity | undefined>(undefined)
const IdentityStaleContext = createContext(false)

/**
 * Only a 401/403 from `/api/me` is a statement ABOUT THE IDENTITY: the session is gone
 * (401) or the resolved account is deactivated (403). Everything else a failed fetch can
 * produce — offline, DNS, a proxy 502, a 500, a timeout, a laptop resuming from sleep and
 * losing the in-flight request — is a transport failure that says nothing about who the
 * caller is. `ApiError` carries the HTTP status (see `lib/api.ts`), so the two are
 * distinguished by status rather than by matching on a message string.
 */
function isIdentityFailure(error: unknown): boolean {
  return error instanceof ApiError && (error.status === 401 || error.status === 403)
}

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
 * refresh leaves the last confirmed identity available, while an identity failure
 * (401/403) or a changed user blocks descendants synchronously and purges every
 * owner-scoped cache entry. A transient transport failure is NOT an identity change:
 * the last validated identity is retained and merely flagged stale.
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
  const identityFailed = me.isError && isIdentityFailure(me.error)
  // `/api/me` could not be reached, but nothing says the identity changed. Descendants
  // keep working against the last validated identity; consumers that want to say so
  // read `useIdentityIsStale()`.
  const identityIsStale = me.isError && !identityFailed
  const blocked = identityFailed || identityChanged

  useEffect(() => {
    if (me.isError) {
      // Transient transport failure — retain the last validated identity and every
      // personal cache entry. Purging here is what turned a dropped connection into a
      // false "Sign-in required".
      if (!identityFailed) return
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
  }, [identityChanged, identityFailed, me.isError, me.isFetching, queryClient, responseIdentity, validated])

  const value = useMemo(() => blocked ? undefined : validated, [blocked, validated])
  return (
    <IdentityScopeContext.Provider value={value}>
      <IdentityStaleContext.Provider value={identityIsStale}>{children}</IdentityStaleContext.Provider>
    </IdentityScopeContext.Provider>
  )
}

/**
 * The full validated identity, or `undefined` while `/api/me` has not yet produced one
 * (initial load) or after an identity failure / changed user. Callers that must
 * distinguish "still resolving" from "resolved, not an admin" pair this with
 * `useMe().isError` and `useIdentityIsStale()`.
 */
export function useIdentity(): ValidatedIdentity | undefined {
  return useContext(IdentityScopeContext)
}

/**
 * True when the last `/api/me` attempt failed for a NON-identity reason (offline, 5xx,
 * timeout). The published identity — if there is one — is still the last validated one
 * and personal caches are intact; the UI should say "we could not refresh your session"
 * rather than "sign-in required". Never true for a 401/403: those clear the identity.
 */
export function useIdentityIsStale(): boolean {
  return useContext(IdentityStaleContext)
}

export function useUserScope(): UserScopeId | undefined {
  return useContext(IdentityScopeContext)?.user_id
}

export function useIsAdmin(): boolean {
  return useContext(IdentityScopeContext)?.is_admin === true
}
