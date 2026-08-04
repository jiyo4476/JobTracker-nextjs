// @vitest-environment happy-dom

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ScopeTabs } from '@/components/jobs/ScopeTabs'

describe('ScopeTabs accessibility', () => {
  it('exposes a labeled tablist with one selected tab and roving tabindex', () => {
    render(<ScopeTabs scope="tracked" onScopeChange={() => {}} />)

    const tablist = screen.getByRole('tablist', { name: 'Job views' })
    expect(tablist).toBeTruthy()

    const tabs = screen.getAllByRole('tab')
    expect(tabs.map(t => t.textContent)).toEqual(['My Jobs', 'Browse Catalog', 'Hidden'])

    const selected = screen.getByRole('tab', { name: 'My Jobs' })
    expect(selected.getAttribute('aria-selected')).toBe('true')
    expect(selected.getAttribute('tabindex')).toBe('0')

    const other = screen.getByRole('tab', { name: 'Hidden' })
    expect(other.getAttribute('aria-selected')).toBe('false')
    expect(other.getAttribute('tabindex')).toBe('-1')
  })

  it('activates a tab on click', async () => {
    const onScopeChange = vi.fn()
    const user = userEvent.setup()
    render(<ScopeTabs scope="tracked" onScopeChange={onScopeChange} />)

    await user.click(screen.getByRole('tab', { name: 'Browse Catalog' }))
    expect(onScopeChange).toHaveBeenCalledWith('catalog')
  })

  it('moves selection with ArrowRight/ArrowLeft/Home/End keys', async () => {
    const onScopeChange = vi.fn()
    const user = userEvent.setup()
    render(<ScopeTabs scope="tracked" onScopeChange={onScopeChange} />)

    screen.getByRole('tab', { name: 'My Jobs' }).focus()
    await user.keyboard('{ArrowRight}')
    expect(onScopeChange).toHaveBeenLastCalledWith('catalog')

    await user.keyboard('{End}')
    expect(onScopeChange).toHaveBeenLastCalledWith('hidden')

    await user.keyboard('{Home}')
    expect(onScopeChange).toHaveBeenLastCalledWith('tracked')

    // Wraps from the first tab back to the last.
    await user.keyboard('{ArrowLeft}')
    expect(onScopeChange).toHaveBeenLastCalledWith('hidden')
  })
})
