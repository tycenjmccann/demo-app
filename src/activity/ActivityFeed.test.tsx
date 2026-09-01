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
})
