import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import App from './App'
import { getActivities } from './activity'

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  cleanup()
})

describe('App — email notifications toggle (TEAM-3662)', () => {
  it('appends a settings activity entry when the toggle is turned on', () => {
    render(<App />)
    const toggle = screen.getByRole('button', { name: 'Toggle email notifications' })

    fireEvent.click(toggle)

    expect(toggle.getAttribute('aria-pressed')).toBe('true')
    const activities = getActivities()
    expect(activities).toHaveLength(1)
    expect(activities[0].type).toBe('settings')
    expect(activities[0].description).toBe('Turned email notifications on.')
  })

  it('appends an off entry when toggled back off, and the feed shows both', () => {
    render(<App />)
    const toggle = screen.getByRole('button', { name: 'Toggle email notifications' })

    fireEvent.click(toggle)
    fireEvent.click(toggle)

    expect(toggle.getAttribute('aria-pressed')).toBe('false')
    expect(getActivities().map(item => item.description)).toEqual([
      'Turned email notifications off.',
      'Turned email notifications on.',
    ])
    expect(screen.getByText('Turned email notifications on.')).toBeDefined()
    expect(screen.getByText('Turned email notifications off.')).toBeDefined()
    expect(screen.queryByText('No recent activity yet.')).toBeNull()
  })
})
