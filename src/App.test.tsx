import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { getActivities } from './activity/activityStore'

const SETTINGS_KEY = 'demo.settings.emailNotifications'

function getToggle(): HTMLElement {
  return screen.getByRole('button', { name: 'Toggle email notifications' })
}

// The Settings section only. Scoping through it keeps relative-label queries
// away from the Activity feed, which renders its own "just now" / "5m ago"
// labels in a sibling section.
function getSettingsSection(): HTMLElement {
  const section = getToggle().closest('section')

  expect(section).not.toBeNull()
  return section as HTMLElement
}

function queryLastChangedLine(): HTMLElement | null {
  return getSettingsSection().querySelector('.settings__control-meta')
}

// The paragraph is a text node plus a <time> sibling, so its full string is
// only visible via textContent. Asserting the whole "Last changed ..." string
// is also what keeps these assertions unambiguous.
function lastChangedText(): string | null {
  return queryLastChangedLine()?.textContent ?? null
}

describe('App email notifications persistence', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // --- R1 persistence across a reload ----------------------------------

  it('persists across remount for On then Off', () => {
    const { unmount: unmountFirst } = render(<App />)

    fireEvent.click(getToggle())
    expect(getToggle()).toHaveAttribute('aria-pressed', 'true')
    expect(getToggle()).toHaveTextContent('On')

    unmountFirst()

    // A fresh render is a faithful stand-in for a reload: hydration reads
    // localStorage in a lazy initializer with no module-level cache.
    const { unmount: unmountSecond } = render(<App />)
    expect(getToggle()).toHaveAttribute('aria-pressed', 'true')
    expect(getToggle()).toHaveTextContent('On')

    fireEvent.click(getToggle())
    expect(getToggle()).toHaveAttribute('aria-pressed', 'false')
    expect(getToggle()).toHaveTextContent('Off')

    unmountSecond()

    render(<App />)
    expect(getToggle()).toHaveAttribute('aria-pressed', 'false')
    expect(getToggle()).toHaveTextContent('Off')
  })

  it('distinguishes a persisted false from nothing persisted', () => {
    localStorage.setItem(
      SETTINGS_KEY,
      JSON.stringify({ enabled: false, lastChangedAt: Date.now() }),
    )

    render(<App />)

    // Off, but the Last changed line is present, because a persisted `false` is
    // a real value rather than a missing key.
    expect(getToggle()).toHaveAttribute('aria-pressed', 'false')
    expect(getToggle()).toHaveTextContent('Off')
    expect(queryLastChangedLine()).not.toBeNull()
  })

  // --- R2 default when nothing persisted -------------------------------

  it('is Off with no Last changed line when nothing is persisted', () => {
    render(<App />)

    expect(getToggle()).toHaveAttribute('aria-pressed', 'false')
    expect(getToggle()).toHaveTextContent('Off')
    expect(queryLastChangedLine()).toBeNull()
    expect(screen.queryByText(/^Last changed/)).toBeNull()
  })

  // --- R3 Last changed line --------------------------------------------

  it('shows "Last changed just now" after a toggle and refreshes to "5m ago" on the 30s tick', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))

    render(<App />)
    expect(queryLastChangedLine()).toBeNull()

    fireEvent.click(getToggle())
    expect(lastChangedText()).toBe('Last changed just now')

    // Advance past the 1-minute boundary and past at least one 30 s refresh
    // tick, with no further interaction. This is the regression guard for the
    // label getting stuck reading "just now" forever.
    act(() => {
      vi.advanceTimersByTime(330_000)
    })

    expect(lastChangedText()).toBe('Last changed 5m ago')
    // Scoped to the Settings section: the Activity feed renders its own label.
    expect(within(getSettingsSection()).getByText('5m ago')).toBeInTheDocument()
    expect(within(getSettingsSection()).queryByText('just now')).toBeNull()
  })

  it('derives the label from the persisted timestamp across a reload (1h ago)', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T12:00:00.000Z'))

    localStorage.setItem(
      SETTINGS_KEY,
      JSON.stringify({ enabled: true, lastChangedAt: Date.now() - 90 * 60_000 }),
    )

    render(<App />)

    // 90 minutes before "now" reads as 1h ago, proving the label comes from the
    // persisted timestamp rather than from mount time.
    expect(lastChangedText()).toBe('Last changed 1h ago')
    expect(getToggle()).toHaveAttribute('aria-pressed', 'true')
  })

  it('renders the label inside a <time> with dateTime and non-empty title', () => {
    const lastChangedAt = Date.parse('2026-01-01T00:00:00.000Z')
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ enabled: true, lastChangedAt }))

    render(<App />)

    const timeElement = queryLastChangedLine()?.querySelector('time')

    expect(timeElement).not.toBeNull()
    expect(timeElement).toHaveAttribute('dateTime', new Date(lastChangedAt).toISOString())
    expect(timeElement?.getAttribute('title')).toBe(new Date(lastChangedAt).toString())
    expect(timeElement?.getAttribute('title')).not.toBe('')
    // The relative label is the visible text, so nothing essential lives only
    // in the tooltip.
    expect(timeElement?.textContent).toBe(timeElement?.textContent?.trim())
    expect(timeElement?.textContent).not.toBe('')
  })

  it('is not a live region', () => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ enabled: true, lastChangedAt: Date.now() }))

    render(<App />)

    expect(queryLastChangedLine()).not.toHaveAttribute('aria-live')
  })

  // --- R4 activity feed records each change exactly once ----------------

  it('records exactly one activity per click with the expected descriptions', () => {
    render(<App />)

    expect(getActivities()).toHaveLength(0)

    const countBeforeFirstClick = getActivities().length
    fireEvent.click(getToggle())
    expect(getActivities()).toHaveLength(countBeforeFirstClick + 1)
    expect(getActivities()[0].description).toBe('Turned email notifications on.')
    expect(getActivities()[0].type).toBe('settings')

    const countBeforeSecondClick = getActivities().length
    fireEvent.click(getToggle())
    expect(getActivities()).toHaveLength(countBeforeSecondClick + 1)
    expect(getActivities()[0].description).toBe('Turned email notifications off.')
  })

  it('persists lastChangedAt equal to the recorded activity timestamp', () => {
    render(<App />)

    fireEvent.click(getToggle())

    const persisted = JSON.parse(localStorage.getItem(SETTINGS_KEY) as string)

    expect(persisted.enabled).toBe(true)
    expect(persisted.lastChangedAt).toBe(getActivities()[0].timestamp)
  })

  it('writes no activity on hydration', () => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ enabled: true, lastChangedAt: Date.now() }))

    render(<App />)

    // Loading is not a user action: mount and its effects must not grow the feed.
    expect(getActivities()).toHaveLength(0)
    expect(getToggle()).toHaveAttribute('aria-pressed', 'true')
  })

  it('does not write storage or activity on the 30s refresh tick', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))

    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ enabled: true, lastChangedAt: Date.now() }))

    render(<App />)

    const persistedBefore = localStorage.getItem(SETTINGS_KEY)

    act(() => {
      vi.advanceTimersByTime(120_000)
    })

    expect(localStorage.getItem(SETTINGS_KEY)).toBe(persistedBefore)
    expect(getActivities()).toHaveLength(0)
    expect(lastChangedText()).toBe('Last changed 2m ago')
  })

  it('clears its refresh interval on unmount', () => {
    vi.useFakeTimers()

    const { unmount } = render(<App />)

    expect(vi.getTimerCount()).toBeGreaterThan(0)

    unmount()

    // Both App's and ActivityFeed's effect cleanups clear their own timer ids,
    // so nothing is left pending after unmount.
    expect(vi.getTimerCount()).toBe(0)
  })

  // --- R5 corrupt or tampered storage ----------------------------------

  it('treats corrupt storage as empty and never leaks the raw value', () => {
    const corruptRawValue = 'CORRUPT_SENTINEL_ffff{not json'
    localStorage.setItem(SETTINGS_KEY, corruptRawValue)

    expect(() => render(<App />)).not.toThrow()

    expect(getToggle()).toHaveAttribute('aria-pressed', 'false')
    expect(getToggle()).toHaveTextContent('Off')
    expect(queryLastChangedLine()).toBeNull()
    expect(document.body.textContent).not.toContain(corruptRawValue)
    expect(document.body.textContent).not.toContain('CORRUPT_SENTINEL_ffff')
  })

  it('treats an out-of-range persisted timestamp as nothing persisted', () => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ enabled: true, lastChangedAt: 1e300 }))

    expect(() => render(<App />)).not.toThrow()

    expect(getToggle()).toHaveAttribute('aria-pressed', 'false')
    expect(queryLastChangedLine()).toBeNull()
  })

  // --- R6 storage unavailable or write fails ---------------------------

  it('still flips and records once when the settings write throws', () => {
    const realSetItem = Storage.prototype.setItem
    const setItem = vi
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation(function (this: Storage, key: string, value: string) {
        if (key === SETTINGS_KEY) {
          throw new Error('QuotaExceededError')
        }
        realSetItem.call(this, key, value)
      })

    render(<App />)

    const countBefore = getActivities().length

    expect(() => fireEvent.click(getToggle())).not.toThrow()

    // The click is still reflected on screen for the rest of the session, and
    // the activity entry is still recorded exactly once.
    expect(getToggle()).toHaveAttribute('aria-pressed', 'true')
    expect(getToggle()).toHaveTextContent('On')
    expect(getActivities()).toHaveLength(countBefore + 1)
    expect(getActivities()[0].description).toBe('Turned email notifications on.')
    // Nothing was persisted, and no error is shown to the user.
    expect(localStorage.getItem(SETTINGS_KEY)).toBeNull()
    expect(document.body.textContent).not.toMatch(/error|failed|unable/i)

    setItem.mockRestore()
  })

  it('still flips when all of localStorage is unavailable', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('SecurityError')
    })
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError')
    })

    expect(() => render(<App />)).not.toThrow()
    expect(getToggle()).toHaveAttribute('aria-pressed', 'false')

    expect(() => fireEvent.click(getToggle())).not.toThrow()

    expect(getToggle()).toHaveAttribute('aria-pressed', 'true')
    expect(getToggle()).toHaveTextContent('On')
    expect(document.body.textContent).not.toMatch(/error|failed|unable/i)

    setItem.mockRestore()
    getItem.mockRestore()
  })

  // --- R7 existing markup preserved ------------------------------------

  it('leaves the toggle button markup unchanged and adds no aria-describedby', () => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ enabled: true, lastChangedAt: Date.now() }))

    render(<App />)

    const toggle = getToggle()

    expect(toggle).toBeInTheDocument()
    expect(toggle.tagName).toBe('BUTTON')
    expect(toggle).toHaveAttribute('type', 'button')
    expect(toggle.className).toContain('settings__toggle')
    expect(toggle).toHaveAttribute('aria-label', 'Toggle email notifications')
    expect(toggle).toHaveAttribute('aria-pressed', 'true')
    // Concern 3 was resolved as the strict reading: no attribute is added to
    // the button, including aria-describedby.
    expect(toggle).not.toHaveAttribute('aria-describedby')
    expect(toggle.getAttributeNames().sort()).toEqual([
      'aria-label',
      'aria-pressed',
      'class',
      'type',
    ])

    // The surrounding control row markup is unchanged, and the Last changed
    // line is a sibling of it rather than inside the flex row.
    const controlRow = getSettingsSection().querySelector('.settings__control')
    expect(controlRow).not.toBeNull()
    expect(controlRow?.querySelector('.settings__control-title')?.textContent).toBe(
      'Email notifications',
    )
    expect(controlRow?.querySelector('.settings__control-description')?.textContent).toBe(
      'Receive updates about important account activity.',
    )
    expect(controlRow?.querySelector('.settings__control-meta')).toBeNull()
    expect(queryLastChangedLine()?.previousElementSibling).toBe(controlRow)
  })
})
