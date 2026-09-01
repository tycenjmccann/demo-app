import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
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
