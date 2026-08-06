import { Badge } from '@/components/ui/badge'

/**
 * PAGE-017 — dataset provenance labels.
 *
 * Every number the app shows comes from one of exactly two datasets:
 *
 *   `catalog`  — the SHARED job catalog. Identical for every signed-in user. Postings,
 *                companies, taxonomy demand, and global supply trends. Contains no
 *                `user_job_state`, no contacts, and no notes.
 *   `personal` — the signed-in user's OWN `user_job_state` overlay: what they track,
 *                their stage/priority/notes, their contacts and activity.
 *
 * These two must never be silently mixed, and a personal dataset must never widen to
 * include another user's rows — the owner-scoped API routes guarantee the latter, and
 * these labels make the former legible in the UI.
 */
export type DatasetScope = 'catalog' | 'personal'

const SCOPE_LABEL: Record<DatasetScope, string> = {
  catalog: 'Global catalog',
  personal: 'My data',
}

export function DatasetScopeBadge({ scope, className }: { scope: DatasetScope; className?: string }) {
  return (
    <Badge
      variant="secondary"
      className={[
        'text-[10px] font-medium uppercase tracking-wide',
        scope === 'catalog'
          ? 'bg-sky-100 text-sky-800 hover:bg-sky-100'
          : 'bg-emerald-100 text-emerald-800 hover:bg-emerald-100',
        className ?? '',
      ].join(' ')}
    >
      {SCOPE_LABEL[scope]}
    </Badge>
  )
}

export function DatasetScopeNote({ scope, children }: { scope: DatasetScope; children: React.ReactNode }) {
  return (
    <div
      className={[
        'mb-4 flex items-start gap-3 rounded-md border px-4 py-3 text-sm',
        scope === 'catalog'
          ? 'border-sky-200 bg-sky-50 text-sky-900'
          : 'border-emerald-200 bg-emerald-50 text-emerald-900',
      ].join(' ')}
    >
      <DatasetScopeBadge scope={scope} className="mt-0.5 shrink-0" />
      <p>{children}</p>
    </div>
  )
}
