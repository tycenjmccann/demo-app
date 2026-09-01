import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import ActivityFeed from './ActivityFeed'

beforeEach(() => {
  localStorage.clear()
})

describe('ActivityFeed', () => {
  it('renders the empty state with no list when there are no activities', () => {
    render(<ActivityFeed />)

    expect(screen.getByText('No recent activity yet.')).toBeInTheDocument()

    // No list and no list items in the empty state.
    expect(screen.queryByRole('list')).toBeNull()
    expect(screen.queryAllByRole('listitem')).toHaveLength(0)
    expect(document.querySelector('ul')).toBeNull()
    expect(document.querySelector('li')).toBeNull()
  })

  it('does not throw when a stored entry has a huge finite timestamp (TEAM-3658)', () => {
    // Regression: an out-of-range but finite timestamp must not crash render.
    // Previously new Date(9e15).toISOString() threw RangeError during render.
    localStorage.setItem(
      'demo.activity',
      JSON.stringify([
        { id: 'x', type: 'evil', description: 'huge ts', timestamp: 9e15 },
        { id: 'y', type: 'evil', description: 'astronomical ts', timestamp: 1e300 },
        { id: 'z', type: 'evil', description: 'huge negative ts', timestamp: -9e15 },
      ]),
    )

    expect(() => render(<ActivityFeed />)).not.toThrow()
  })
})
