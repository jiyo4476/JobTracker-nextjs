'use client'

import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useIdentity, useMe } from '@/lib/queries'

/**
 * PAGE-017 — client-side gate for the `/admin` catalog editors.
 *
 * The admin signal is `is_admin` from `GET /api/me`, which mirrors the SERVER-side
 * `identityIsAdmin` decision derived only from the verified token's groups/scopes
 * (see `src/app/api/me/route.ts`). There is no client-asserted admin flag anywhere.
 *
 * This guard is a PRESENTATION control: it stops non-admins from seeing catalog
 * mutation affordances. It is not the security boundary. Every `/api/admin/*` route
 * independently re-authorizes through `resolveAdminUser`, so forcing this component to
 * render (or calling the endpoints directly) still yields 401/403.
 *
 * The three states are deliberately distinct, per the task's UX-states requirement:
 * resolving, unauthenticated/stale session, and resolved-but-not-an-admin.
 */
export function AdminGuard({ children }: { children: React.ReactNode }) {
  const me = useMe()
  const identity = useIdentity()

  // `identity` is published only once /api/me has produced a validated response, so a
  // freshly mounted boundary reports "resolving" rather than briefly claiming "forbidden".
  if (identity === undefined && !me.isError) {
    return (
      <div className="p-8 max-w-3xl" aria-busy="true">
        <Skeleton className="h-7 w-56 mb-2" />
        <Skeleton className="h-4 w-72 mb-6" />
        <Card>
          <CardContent className="pt-6 space-y-4">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}
          </CardContent>
        </Card>
      </div>
    )
  }

  if (me.isError) {
    return (
      <AdminNotice
        title="Sign-in required"
        body="Your session could not be verified. Reload the page to sign in again, then reopen this catalog editor."
      />
    )
  }

  if (!identity?.is_admin) {
    return (
      <AdminNotice
        title="Catalog editing is restricted"
        body="Only catalog administrators can edit shared postings. Your own application details are editable from the job page."
      />
    )
  }

  return <>{children}</>
}

function AdminNotice({ title, body }: { title: string; body: string }) {
  return (
    <div className="p-8 max-w-2xl">
      <Card>
        <CardContent className="pt-6 space-y-3">
          <h1 className="text-lg font-semibold text-slate-900">{title}</h1>
          <p className="text-sm text-slate-600">{body}</p>
          <Link href="/jobs" className="inline-block text-sm text-blue-600 underline">
            Back to jobs
          </Link>
        </CardContent>
      </Card>
    </div>
  )
}
