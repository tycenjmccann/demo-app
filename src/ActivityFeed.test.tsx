import { act, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ActivityFeed } from './ActivityFeed'
import { addActivity } from './activity'

const STORAGE_KEY = 'demo.activity'

function expectActivityTime(description: string, relativeTime: string) {
  const activityItem = screen.getByText(description).closest('li')

  expect(activityItem).not.toBeNull()
  expect(within(activityItem as HTMLElement).getByText(relativeTime)).toBeInTheDocument()
}

describe('ActivityFeed', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.useRealTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders the empty state when there are no activities', () => {
    render(<ActivityFeed />)

    expect(screen.getByText('No recent activity yet. Actions you take will show up here.')).toBeInTheDocument()
  })

  it('live-updates when a new activity is added', () => {
    render(<ActivityFeed />)

    act(() => {
      addActivity('settings', 'Updated notification preferences.')
    })

    expect(screen.getByText('settings')).toBeInTheDocument()
    expect(screen.getByText('Updated notification preferences.')).toBeInTheDocument()
    expect(screen.getByText('just now')).toBeInTheDocument()
  })

  it('renders relative timestamps at expected boundaries', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))

    const now = Date.now()

    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([
        { id: 'future', type: 'settings', description: 'Future activity.', timestamp: now + 5_000 },
        { id: '59-seconds', type: 'settings', description: '59 seconds old.', timestamp: now - 59_000 },
        { id: '60-seconds', type: 'settings', description: '60 seconds old.', timestamp: now - 60_000 },
        { id: '59-minutes', type: 'settings', description: '59 minutes old.', timestamp: now - 59 * 60_000 },
        { id: '60-minutes', type: 'settings', description: '60 minutes old.', timestamp: now - 60 * 60_000 },
        { id: '23-hours', type: 'settings', description: '23 hours old.', timestamp: now - 23 * 60 * 60_000 },
        { id: '24-hours', type: 'settings', description: '24 hours old.', timestamp: now - 24 * 60 * 60_000 },
      ]),
    )

    render(<ActivityFeed />)

    expectActivityTime('Future activity.', 'just now')
    expectActivityTime('59 seconds old.', 'just now')
    expectActivityTime('60 seconds old.', '1m ago')
    expectActivityTime('59 minutes old.', '59m ago')
    expectActivityTime('60 minutes old.', '1h ago')
    expectActivityTime('23 hours old.', '23h ago')
    expectActivityTime('24 hours old.', '1d ago')
    expect(screen.queryByText(/^-/)).not.toBeInTheDocument()
  })

  it('renders only the 20 most recent activities', () => {
    for (let index = 0; index < 25; index += 1) {
      addActivity('settings', `Activity ${index}`)
    }

    render(<ActivityFeed />)

    const list = screen.getByRole('list')
    expect(within(list).getAllByRole('listitem')).toHaveLength(20)
    expect(screen.getByText('Activity 24')).toBeInTheDocument()
    expect(screen.queryByText('Activity 4')).not.toBeInTheDocument()
  })

  it('does not crash when localStorage contains an out-of-range timestamp', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([{ id: 'x', type: 't', description: 'd', timestamp: 1e300 }]),
    )

    expect(() => render(<ActivityFeed />)).not.toThrow()
    expect(screen.getByText('No recent activity yet. Actions you take will show up here.')).toBeInTheDocument()
  })

  it('renders out-of-order valid storage newest-first', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([
        { id: 'oldest', type: 'settings', description: 'Oldest activity.', timestamp: 1 },
        { id: 'newest', type: 'settings', description: 'Newest activity.', timestamp: 3 },
        { id: 'middle', type: 'settings', description: 'Middle activity.', timestamp: 2 },
      ]),
    )

    render(<ActivityFeed />)

    expect(
      within(screen.getByRole('list'))
        .getAllByRole('listitem')
        .map((item) => item.querySelector('.activity-feed__description')?.textContent),
    ).toEqual(['Newest activity.', 'Middle activity.', 'Oldest activity.'])
  })

  it('cleans up its subscription on unmount', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const { unmount } = render(<ActivityFeed />)

    unmount()

    act(() => {
      addActivity('settings', 'Updated after unmount.')
    })

    expect(consoleError).not.toHaveBeenCalled()
    consoleError.mockRestore()
  })
})
