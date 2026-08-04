'use client'

import { useRef } from 'react'
import { cn } from '@/lib/utils'
import type { JobScope } from '@/types/queries'

export const JOB_SCOPE_TABS: { value: JobScope; label: string; hint: string }[] = [
  { value: 'tracked', label: 'My Jobs', hint: 'Jobs you have saved to your tracker' },
  { value: 'catalog', label: 'Browse Catalog', hint: 'Every posting in the shared catalog' },
  { value: 'hidden', label: 'Hidden', hint: 'Jobs you have hidden from My Jobs' },
]

// Accessible tablist for the owner-scoped jobs views. Selection is announced via
// aria-selected; Left/Right/Home/End move between tabs (roving tabindex) per the
// WAI-ARIA tabs pattern. The parent persists the chosen scope in the URL.
export function ScopeTabs({
  scope,
  onScopeChange,
}: {
  scope: JobScope
  onScopeChange: (scope: JobScope) => void
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([])

  function focusTab(index: number) {
    const clamped = (index + JOB_SCOPE_TABS.length) % JOB_SCOPE_TABS.length
    const next = JOB_SCOPE_TABS[clamped]
    refs.current[clamped]?.focus()
    onScopeChange(next.value)
  }

  function handleKeyDown(event: React.KeyboardEvent, index: number) {
    switch (event.key) {
      case 'ArrowLeft':
        event.preventDefault()
        focusTab(index - 1)
        break
      case 'ArrowRight':
        event.preventDefault()
        focusTab(index + 1)
        break
      case 'Home':
        event.preventDefault()
        focusTab(0)
        break
      case 'End':
        event.preventDefault()
        focusTab(JOB_SCOPE_TABS.length - 1)
        break
    }
  }

  return (
    <div role="tablist" aria-label="Job views" className="inline-flex gap-1 rounded-lg border bg-slate-50 p-1">
      {JOB_SCOPE_TABS.map((tab, index) => {
        const selected = tab.value === scope
        return (
          <button
            key={tab.value}
            ref={(el) => { refs.current[index] = el }}
            role="tab"
            type="button"
            id={`scope-tab-${tab.value}`}
            aria-selected={selected}
            aria-controls="jobs-panel"
            tabIndex={selected ? 0 : -1}
            title={tab.hint}
            onClick={() => onScopeChange(tab.value)}
            onKeyDown={(event) => handleKeyDown(event, index)}
            className={cn(
              'rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              selected
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900',
            )}
          >
            {tab.label}
          </button>
        )
      })}
    </div>
  )
}
