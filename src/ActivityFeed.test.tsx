import { act, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { ActivityFeed } from './ActivityFeed'
import { addActivity } from './activity'

describe('ActivityFeed', () => {
  beforeEach(() => {
    localStorage.clear()
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
})
