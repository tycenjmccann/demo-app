import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ActivityFeed from './ActivityFeed'
import { STORAGE_KEY, addActivity, type ActivityItem } from './activity'

function seed(count: number): ActivityItem[] {
  const base = 1_700_000_000_000
  const entries = Array.from({ length: count }, (_, i) => ({
    id: `seed-${String(i).padStart(3, '0')}`,
    type: 'seed',
    description: `entry ${i}`,
    timestamp: base + i * 1_000,
  }))
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries))
  return entries
}

function renderedDescriptions(): string[] {
  return screen
    .getAllByRole('listitem')
    .map(item => item.querySelector('.activity-feed__description')?.textContent ?? '')
}

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('ActivityFeed', () => {
  it('renders the empty state and no list when there is no activity', () => {
    render(<ActivityFeed />)

    expect(screen.getByRole('heading', { name: 'Recent Activity' })).toBeDefined()
    expect(screen.getByText('No recent activity yet.')).toBeDefined()
    expect(screen.queryByRole('list')).toBeNull()
    expect(screen.queryAllByRole('listitem')).toHaveLength(0)
  })

  it('renders the list and no empty state when there is activity', () => {
    seed(2)
    render(<ActivityFeed />)

    expect(screen.getByRole('list')).toBeDefined()
    expect(screen.queryByText('No recent activity yet.')).toBeNull()
    expect(renderedDescriptions()).toEqual(['entry 1', 'entry 0'])
  })

  it('renders at most 20 entries, newest first, when 25 are persisted', () => {
    seed(25)
    render(<ActivityFeed />)

    const descriptions = renderedDescriptions()
    expect(descriptions).toHaveLength(20)
    expect(descriptions[0]).toBe('entry 24')
    expect(descriptions[19]).toBe('entry 5')
    expect(descriptions).toEqual(
      Array.from({ length: 20 }, (_, i) => `entry ${24 - i}`),
    )
  })

  it('uses stable keys so entries are not duplicated on update', () => {
    seed(3)
    render(<ActivityFeed />)
    expect(screen.getAllByRole('listitem')).toHaveLength(3)

    act(() => {
      addActivity('deploy', 'Shipped v1.2.3')
    })

    expect(screen.getAllByRole('listitem')).toHaveLength(4)
  })

  it('picks up a new entry in the same tab without remounting', () => {
    render(<ActivityFeed />)
    expect(screen.getByText('No recent activity yet.')).toBeDefined()

    act(() => {
      addActivity('deploy', 'Shipped v1.2.3')
    })

    expect(screen.queryByText('No recent activity yet.')).toBeNull()
    expect(screen.getByRole('list')).toBeDefined()
    expect(screen.getByText('Shipped v1.2.3')).toBeDefined()
    expect(screen.getByText('deploy')).toBeDefined()

    act(() => {
      addActivity('settings', 'Enabled notifications')
    })

    expect(renderedDescriptions()).toEqual(['Enabled notifications', 'Shipped v1.2.3'])
  })

  it('stops listening after unmount', () => {
    const { unmount } = render(<ActivityFeed />)
    unmount()

    expect(() =>
      act(() => {
        addActivity('deploy', 'after unmount')
      }),
    ).not.toThrow()
  })

  it('advances relative times on an interval without a new activity (Finding 1)', () => {
    vi.useFakeTimers()
    const base = 1_700_000_000_000
    vi.setSystemTime(base)
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([
        { id: 'x', type: 'deploy', description: 'Shipped', timestamp: base },
      ]),
    )

    render(<ActivityFeed />)
    expect(screen.getByText('just now')).toBeDefined()

    // Age the clock past a minute — no addActivity is ever called.
    act(() => {
      vi.advanceTimersByTime(61_000)
    })

    expect(screen.getByText('1m ago')).toBeDefined()
    expect(screen.queryByText('just now')).toBeNull()
  })

  it('tears down the refresh interval on unmount (Finding 1)', () => {
    vi.useFakeTimers()
    const { unmount } = render(<ActivityFeed />)

    // One interval registered while mounted.
    expect(vi.getTimerCount()).toBe(1)

    unmount()

    // Cleared on teardown; advancing time afterwards is a no-op (no act warnings).
    expect(vi.getTimerCount()).toBe(0)
    expect(() => {
      vi.advanceTimersByTime(120_000)
    }).not.toThrow()
  })

  it('keeps a live region mounted in the empty state so the first entry is announced (Finding 2)', () => {
    const { container } = render(<ActivityFeed />)

    const live = container.querySelector('[aria-live="polite"]')
    expect(live).not.toBeNull()
    expect(screen.getByText('No recent activity yet.')).toBeDefined()

    act(() => {
      addActivity('deploy', 'Shipped v1.2.3')
    })

    // The same live-region node now hosts the list: an UPDATE, not a fresh mount.
    expect(container.querySelector('[aria-live="polite"]')).toBe(live)
    expect(screen.getByRole('list')).toBeDefined()
    expect(screen.getByText('Shipped v1.2.3')).toBeDefined()
  })

  it('exposes a machine-readable timestamp on each entry', () => {
    const [entry] = seed(1)
    render(<ActivityFeed />)

    const time = screen.getByRole('listitem').querySelector('time')
    expect(time?.getAttribute('dateTime') ?? time?.getAttribute('datetime')).toBe(
      new Date(entry.timestamp).toISOString(),
    )
    expect(time?.getAttribute('title')).toBe(new Date(entry.timestamp).toLocaleString())
  })
})
